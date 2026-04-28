from enum import Enum


class SynchronizeSessionEnum(str, Enum):
    FETCH = "fetch"
    EVALUATE = "evaluate"
    FALSE = "false"
