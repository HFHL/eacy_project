import pytest

from app.repositories import data_context_repository
from app.repositories.data_context_repository import RecordInstanceRepository


class _ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar(self):
        return self.value


class _FakeSession:
    def __init__(self, value):
        self.value = value

    async def execute(self, _query):
        return _ScalarResult(self.value)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("current_max", "expected_next"),
    [
        (None, 0),
        (0, 1),
        (2, 3),
    ],
)
async def test_next_repeat_index_starts_empty_form_at_zero(monkeypatch, current_max, expected_next):
    monkeypatch.setattr(data_context_repository, "session", _FakeSession(current_max))

    repository = RecordInstanceRepository()

    assert await repository.next_repeat_index(context_id="context-1", form_key="诊断记录.诊断记录") == expected_next
