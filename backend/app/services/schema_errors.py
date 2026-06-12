class SchemaServiceError(ValueError):
    pass


class SchemaNotFoundError(SchemaServiceError):
    pass


class SchemaConflictError(SchemaServiceError):
    pass
