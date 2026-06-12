import { Descriptions } from 'antd'
import {
  archiveDocument,
  matchGroup,
  resolveDocumentRecommendedPatientId,
} from '../../../api/document'
import { modalWidthPreset } from '../../../styles/themeTokens'
import {
  formatMatchScorePercent,
  getGroupRecommendedPatient,
  getRecommendedArchiveLabel,
} from './formatters'

export const confirmRecommendedArchive = async ({
  groupDocsMap,
  handleArchivePatient,
  message,
  modal,
  record,
  refreshAll,
  treeData,
}) => {
  const hideLoading = message.loading('正在获取推荐信息...', 0)
  try {
    const resolved = await resolveDocumentRecommendedPatientId(record.id, {
      groupId: record?._groupId,
      groupMatchInfo: record?._groupId ? groupDocsMap[record._groupId]?.matchInfo : null,
      treeGroups: treeData?.todo_groups || [],
      fetchGroupMatchInfo: matchGroup,
    })
    const { patientId: recommendedPatientId, matchInfo } = resolved
    hideLoading()

    if (!recommendedPatientId) {
      message.warning('未找到AI推荐的患者，请手动选择')
      handleArchivePatient(record.id)
      return
    }

    const { candidate } = getGroupRecommendedPatient(matchInfo || {})
    const patientName = candidate?.name || candidate?.patient_name || '未知'
    const matchScore = matchInfo?.match_score ?? candidate?.similarity
    const confirmLabel = getRecommendedArchiveLabel(patientName, matchScore)
    const matchScoreText = formatMatchScorePercent(matchScore)

    modal.confirm({
      title: confirmLabel,
      content: (
        <div>
          <p>AI 推荐将该文档归档到以下患者：</p>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="患者姓名">{patientName}</Descriptions.Item>
            <Descriptions.Item label="匹配分数">{matchScoreText || '--'}</Descriptions.Item>
          </Descriptions>
        </div>
      ),
      okText: confirmLabel,
      cancelText: '取消',
      centered: true,
      width: modalWidthPreset.standard,
      onOk: async () => {
        try {
          const res = await archiveDocument(record.id, recommendedPatientId, true)
          if (res?.success) {
            message.success(`已归档到患者「${patientName}」`)
            refreshAll({ forceTree: true })
          } else {
            message.error(res?.message || '归档失败')
          }
        } catch {
          message.error('归档失败')
        }
      },
    })
  } catch {
    hideLoading()
    message.error('获取推荐信息失败')
  }
}
