import React, { useMemo } from 'react'
import { Alert, Modal, Typography, message } from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  ExportOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { batchDeleteCheck, batchDeletePatients } from '../../../api/patient'
import { appThemeToken } from '../../../styles/themeTokens'

const { Text } = Typography

const buildDeleteConfirmContent = ({ selectedCount, linkedProjects }) => (
  <div>
    <p>确定要删除选中的 <strong>{selectedCount}</strong> 位患者吗？此操作不可恢复。</p>
    {linkedProjects.length > 0 && (
      <Alert
        type="warning"
        showIcon
        style={{ marginTop: 12 }}
        message="以下科研项目包含选中的患者，删除后将同时从项目中移出"
        description={
          <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
            {linkedProjects.map(project => (
              <li key={project.project_id}>
                {project.project_name}（涉及 {project.patient_count} 位患者）
              </li>
            ))}
          </ul>
        }
      />
    )}
  </div>
)

const showDeleteResult = ({ success_count, failed_count, failed_ids, removed_from_projects }) => {
  if (failed_count > 0) {
    Modal.warning({
      title: '批量删除完成',
      content: (
        <div>
          <p>成功删除: {success_count} 位患者</p>
          <p style={{ color: appThemeToken.colorError }}>删除失败: {failed_count} 位患者</p>
          {failed_ids && failed_ids.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">失败的患者ID:</Text>
              <div style={{ maxHeight: 200, overflow: 'auto', marginTop: 4 }}>
                {failed_ids.map(id => (
                  <div key={id} style={{ fontSize: 12 }}>{id}</div>
                ))}
              </div>
            </div>
          )}
          {removed_from_projects && removed_from_projects.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <Text type="warning">已从以下项目中移出: {removed_from_projects.join('、')}</Text>
            </div>
          )}
        </div>
      )
    })
    return
  }

  let successMessage = `成功删除 ${success_count} 位患者`
  if (removed_from_projects && removed_from_projects.length > 0) {
    successMessage += `，已从 ${removed_from_projects.length} 个科研项目中移出`
  }
  message.success(successMessage)
}

const usePatientBatchActions = ({
  selectedRowKeys,
  onOpenExport,
  onSelectionClear,
  fetchPatients,
}) => {
  const batchActions = useMemo(() => [
    {
      key: 'export',
      icon: <ExportOutlined />,
      label: '批量导出'
    },
    {
      key: 'add-to-project',
      icon: <PlusOutlined />,
      label: '添加到项目'
    },
    {
      key: 'update-tags',
      icon: <EditOutlined />,
      label: '批量标签'
    },
    {
      type: 'divider'
    },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: '批量删除',
      danger: true
    }
  ], [])

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要删除的患者')
      return
    }

    let linkedProjects = []
    try {
      const checkResp = await batchDeleteCheck({ patient_ids: selectedRowKeys })
      if (checkResp.success && checkResp.data?.projects) {
        linkedProjects = checkResp.data.projects
      }
    } catch {
      // 检查失败不阻塞删除流程
    }

    Modal.confirm({
      title: '确认删除患者',
      content: buildDeleteConfirmContent({
        selectedCount: selectedRowKeys.length,
        linkedProjects,
      }),
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      width: linkedProjects.length > 0 ? 520 : undefined,
      onOk: async () => {
        try {
          const response = await batchDeletePatients({ patient_ids: selectedRowKeys })

          if (response.success) {
            showDeleteResult(response.data)
            onSelectionClear()
            fetchPatients()
          }
        } catch (error) {
          console.error('批量删除失败:', error)
          message.error('批量删除失败，请稍后重试')
        }
      }
    })
  }

  const handleBatchAction = ({ key }) => {
    console.log('批量操作:', key, selectedRowKeys)
    if (key === 'export') {
      onOpenExport()
    } else if (key === 'delete') {
      handleBatchDelete()
    }
  }

  return {
    batchActions,
    handleBatchAction,
  }
}

export default usePatientBatchActions
