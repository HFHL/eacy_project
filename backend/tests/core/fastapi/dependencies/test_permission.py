from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import Request

from core.fastapi.dependencies import (
    AllowAll,
    IsAdmin,
    IsAuthenticated,
    PermissionDependency,
)
from core.fastapi.dependencies.permission import UnauthorizedException


@pytest.mark.asyncio
async def test_permission_dependency_is_authenticated():
    # Given
    dependency = PermissionDependency(permissions=[IsAuthenticated])
    request = AsyncMock(spec=Request)
    request.user = Mock(id=None)

    # When, Then
    with pytest.raises(UnauthorizedException):
        await dependency(request=request)


@pytest.mark.asyncio
async def test_permission_dependency_is_admin_user_is_not_admin():
    # Given
    dependency = PermissionDependency(permissions=[IsAdmin])
    request = AsyncMock(spec=Request)
    user_id = 1
    request.user = Mock(id=user_id)

    # When, Then
    with pytest.raises(UnauthorizedException):
        await dependency(request=request)


@pytest.mark.asyncio
async def test_permission_dependency_is_admin_user_id_is_none():
    # Given
    dependency = PermissionDependency(permissions=[IsAdmin])
    request = AsyncMock(spec=Request)
    request.user = Mock(id=None)

    # When, Then
    with pytest.raises(UnauthorizedException):
        await dependency(request=request)


@pytest.mark.asyncio
async def test_permission_dependency_allow_all():
    # Given
    dependency = PermissionDependency(permissions=[AllowAll])
    request = AsyncMock(spec=Request)

    # When
    sut = await dependency(request=request)

    # Then
    assert sut is None
