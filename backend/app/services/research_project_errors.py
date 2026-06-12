class ResearchProjectServiceError(ValueError):
    pass


class ResearchProjectNotFoundError(ResearchProjectServiceError):
    pass


class ResearchProjectConflictError(ResearchProjectServiceError):
    pass
