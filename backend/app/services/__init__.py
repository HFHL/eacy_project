__all__ = [
    "DocumentService",
    "EhrService",
    "ExtractionService",
    "PatientService",
    "ResearchProjectService",
    "SchemaService",
    "StructuredValueService",
]

_SERVICE_IMPORTS = {
    "DocumentService": ".document_service",
    "EhrService": ".ehr_service",
    "ExtractionService": ".extraction_service",
    "PatientService": ".patient_service",
    "ResearchProjectService": ".research_project_service",
    "SchemaService": ".schema_service",
    "StructuredValueService": ".structured_value_service",
}


def __getattr__(name):
    if name not in _SERVICE_IMPORTS:
        raise AttributeError(name)
    from importlib import import_module

    module = import_module(_SERVICE_IMPORTS[name], __name__)
    value = getattr(module, name)
    globals()[name] = value
    return value
