from __future__ import annotations

from typing import Any

from app.models import ExtractionJob
from app.services.extraction_errors import (
    ExtractionConflictError,
    ExtractionNotFoundError,
    ExtractionTargetValidationError,
)
from app.services.extraction_plan_trace import build_folder_plan_json
from core.db import session


class ExtractionFolderProjectBatchMixin:
    async def update_project_crf_folder_batch(
        self,
        *,
        project_id: str,
        project_patient_ids: list[str] | None = None,
        requested_by: str | None = None,
        target_form_keys: list[str] | None = None,
        mode: str | None = None,
    ) -> dict[str, Any]:
        from app.services.research_project_service import (
            ResearchProjectConflictError,
            ResearchProjectNotFoundError,
            ResearchProjectService,
        )

        research_service = ResearchProjectService()
        project = await research_service.get_project(project_id, owner_id=requested_by)
        if project is None:
            raise ExtractionNotFoundError("Research project not found")

        if project_patient_ids:
            target_ids = [pid for pid in project_patient_ids if pid]
        else:
            try:
                project_patients = await research_service.list_project_patients(
                    project_id, owner_id=requested_by
                )
            except ResearchProjectNotFoundError as error:
                raise ExtractionNotFoundError(str(error)) from error
            except ResearchProjectConflictError as error:
                raise ExtractionConflictError(str(error)) from error
            target_ids = [pp.id for pp in project_patients]

        options = self._normalize_folder_update_options(target_form_keys=target_form_keys, mode=mode)
        preloaded_crfs: dict[str, dict[str, Any]] = {}
        prevalidation_skipped_patients: list[dict[str, str]] = []
        prevalidation_skipped_patient_ids: set[str] = set()
        if options.target_form_keys:
            for project_patient_id in target_ids:
                try:
                    crf = await research_service.get_project_crf(
                        project_id=project_id,
                        project_patient_id=project_patient_id,
                        created_by=requested_by,
                        owner_id=requested_by,
                    )
                except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
                    prevalidation_skipped_patients.append(
                        {"project_patient_id": project_patient_id, "reason": str(error)}
                    )
                    prevalidation_skipped_patient_ids.add(project_patient_id)
                    continue
                context = crf.get("context")
                schema_json = crf.get("schema")
                if context is None or not isinstance(schema_json, dict):
                    prevalidation_skipped_patients.append(
                        {
                            "project_patient_id": project_patient_id,
                            "reason": "Project CRF schema context not found",
                        }
                    )
                    prevalidation_skipped_patient_ids.add(project_patient_id)
                    continue
                self._validate_target_form_keys_for_schema(
                    schema_json=schema_json,
                    target_form_keys=options.target_form_keys,
                )
                preloaded_crfs[project_patient_id] = crf

        batch = await self.task_progress_service.create_batch(
            task_type=self._folder_batch_task_type(
                folder_task_type="project_crf_folder_extract",
                options=options,
            ),
            title=self._folder_batch_title(base_title="批量更新项目 CRF", options=options),
            scope_type="project",
            project_id=project_id,
            requested_by=requested_by,
        )

        all_jobs: list[ExtractionJob] = []
        processed_patients = 0
        skipped_patients: list[dict[str, str]] = list(prevalidation_skipped_patients)
        skipped_documents: list[dict[str, str]] = []
        agg_documents_total = 0
        agg_eligible_documents = 0
        agg_already_extracted_documents = 0
        agg_planned_documents = 0
        combined_plan_documents: list[dict[str, Any]] = []
        combined_plan_skipped: list[dict[str, str]] = []

        for project_patient_id in target_ids:
            crf = preloaded_crfs.get(project_patient_id)
            if crf is None:
                if project_patient_id in prevalidation_skipped_patient_ids:
                    continue
                try:
                    crf = await research_service.get_project_crf(
                        project_id=project_id,
                        project_patient_id=project_patient_id,
                        created_by=requested_by,
                        owner_id=requested_by,
                    )
                except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
                    skipped_patients.append(
                        {"project_patient_id": project_patient_id, "reason": str(error)}
                    )
                    continue

            context = crf.get("context")
            schema_json = crf.get("schema")
            if context is None or not isinstance(schema_json, dict):
                skipped_patients.append(
                    {
                        "project_patient_id": project_patient_id,
                        "reason": "Project CRF schema context not found",
                    }
                )
                continue

            patient_id = context.patient_id
            documents = await self.document_repository.list_by_patient(
                patient_id,
                limit=1000,
                uploaded_by=None,
            )
            eligible_documents = [d for d in documents if self._document_ready_for_extraction(d)]
            existing_jobs = await self.job_repository.list_by_patient_documents(
                patient_id=patient_id,
                document_ids=[d.id for d in eligible_documents],
            )
            existing_forms_by_document = self._existing_target_forms_by_document(
                existing_jobs,
                job_types={"project_crf"},
                project_id=project_id,
                project_patient_id=project_patient_id,
            )
            if options.target_form_keys or options.mode == "full":
                pending_documents = eligible_documents
                extracted_document_ids: set[str] = set()
                patient_already_extracted_ids: set[str] = set()
            else:
                extracted_document_ids = self._existing_full_schema_document_ids(
                    existing_jobs,
                    job_types={"project_crf"},
                    project_id=project_id,
                    project_patient_id=project_patient_id,
                )
                pending_documents = [d for d in eligible_documents if str(d.id) not in extracted_document_ids]
                patient_already_extracted_ids = set(extracted_document_ids)

            agg_documents_total += len(documents)
            agg_eligible_documents += len(eligible_documents)
            agg_already_extracted_documents += len(extracted_document_ids)
            agg_planned_documents += len(pending_documents)

            patient_jobs: list[ExtractionJob] = []
            patient_skipped: list[dict[str, str]] = []
            for document in pending_documents:
                plan_items = self._pending_plan_items_for_document(
                    document=document,
                    schema_json=schema_json,
                    existing_forms_by_document=existing_forms_by_document,
                    options=options,
                    source_tag="project_crf_folder_update",
                    source_roles={"primary", "secondary"},
                )
                if not plan_items:
                    skip_entry = {
                        "project_patient_id": project_patient_id,
                        "document_id": document.id,
                        "reason": "no matching extraction target",
                    }
                    skipped_documents.append(skip_entry)
                    patient_skipped.append({"document_id": document.id, "reason": skip_entry["reason"]})
                    continue
                patient_jobs.append(
                    await self._create_pending_planned_job_for_plan_items(
                        plan_items,
                        job_type="project_crf",
                        requested_by=requested_by,
                        source="project_crf_targeted_extract" if options.target_form_keys else "project_crf_folder_update",
                        base_input_json={"enqueue_async": True},
                        priority=0,
                        patient_id=patient_id,
                        document_id=document.id,
                        project_id=project_id,
                        project_patient_id=project_patient_id,
                        context_id=context.id,
                        schema_version_id=context.schema_version_id,
                    )
                )
            all_jobs.extend(patient_jobs)
            patient_plan = build_folder_plan_json(
                options={"mode": options.mode, "target_form_keys": options.target_form_keys or []},
                schema_version_id=context.schema_version_id,
                source_tag="project_crf_folder_update",
                documents_total=len(documents),
                eligible_documents=eligible_documents,
                pending_documents=pending_documents,
                already_extracted_document_ids=patient_already_extracted_ids,
                jobs=patient_jobs,
                skipped=patient_skipped,
                schema_json=schema_json,
                planner=self.extraction_planner,
                extra_stats={
                    "project_id": project_id,
                    "project_patient_id": project_patient_id,
                },
            )
            for doc_entry in patient_plan.get("documents") or []:
                doc_entry["project_patient_id"] = project_patient_id
                combined_plan_documents.append(doc_entry)
            combined_plan_skipped.extend(patient_skipped)
            processed_patients += 1

        await self.task_progress_service.persist_plan_snapshot(
            batch.id,
            {
                "options": {"mode": options.mode, "target_form_keys": options.target_form_keys or []},
                "schema_version_id": None,
                "source_tag": "project_crf_folder_update",
                "stats": {
                    "documents_total": agg_documents_total,
                    "eligible_documents": agg_eligible_documents,
                    "planned_jobs": len(all_jobs),
                    "processed_patients": processed_patients,
                    "skipped_patients": len(skipped_patients),
                    "skipped_documents": len(skipped_documents),
                    "already_extracted_documents": agg_already_extracted_documents,
                    "pending_documents": agg_planned_documents,
                },
                "documents": combined_plan_documents,
                "skipped": combined_plan_skipped,
                "skipped_patients": skipped_patients,
                "skipped_documents": skipped_documents,
            },
        )

        if all_jobs:
            await self._ensure_folder_batch_items_for_jobs(batch_id=batch.id, jobs=all_jobs)
            await self._commit_pending_jobs_before_enqueue()
            for job in all_jobs:
                await self._schedule_or_enqueue_extraction_task(job.id)
        else:
            await self.task_progress_service.aggregate_batch(batch.id)
            await session.commit()

        return {
            "batch_id": batch.id,
            "project_id": project_id,
            "total_project_patients": len(target_ids),
            "processed_patients": processed_patients,
            "documents_total": agg_documents_total,
            "eligible_documents": agg_eligible_documents,
            "already_extracted_documents": agg_already_extracted_documents,
            "planned_documents": agg_planned_documents,
            "created_jobs": len(all_jobs),
            "jobs": all_jobs,
            "submitted_jobs": len(all_jobs),
            "completed_jobs": 0,
            "failed_jobs": 0,
            "skipped_patients": skipped_patients,
            "skipped_documents": skipped_documents,
        }
