import asyncio
from app.tasks import run_extraction_task
import os
os.environ["CELERY_ALWAYS_EAGER"] = "1"
run_extraction_task(job_id="job_05b1f8e5356d4bb5a42ad28a8989887b", document_ids=["c370dbd8-f1e9-4d0a-b902-f03aacb26e76", "cb8ea7de-2f40-43f6-99b0-8e191708dddf", "8707af15-0da8-4398-b79b-793231e0ea7e", "0af89c68-3bfd-4834-b698-28c2bd6c1cd1", "faf26039-8443-4696-90d7-828dc80168e5", "986126e2-e2cc-43f0-b328-deb392b80fde", "fb208548-1ab6-46c2-8797-33295f3c5ddc"], patient_id="107d185d-ef40-43f0-8d55-2c3c63309b2c", schema_id="d20b08fc-b73e-42cf-9c1b-8e89247c71f0", instance_type="patient_ehr")
