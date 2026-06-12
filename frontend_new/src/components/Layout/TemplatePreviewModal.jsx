import React from 'react'
import {
  Divider,
  Empty,
  Modal,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd'

const { Text } = Typography

const fieldGridColumns = '44px minmax(160px, 1.4fr) minmax(120px, 1fr) 96px minmax(160px, 1fr)'

const TemplatePreviewModal = ({
  detail,
  loading,
  model,
  onCancel,
  open,
  token,
}) => (
  <Modal
    title="CRF 模板预览"
    open={open}
    width={920}
    footer={null}
    destroyOnClose
    onCancel={onCancel}
    bodyStyle={{ maxHeight: '72vh', overflowY: 'auto' }}
  >
    {loading ? (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <Spin />
      </div>
    ) : (
      <>
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ fontSize: 16 }}>{detail?.template_name || detail?.name || '未命名模板'}</Text>
          <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px 16px', fontSize: 13 }}>
            <div><Text type="secondary">模板代码：</Text><Text code>{detail?.template_code || '-'}</Text></div>
            <div><Text type="secondary">分类：</Text>{detail?.type || detail?.template_type || '-'}</div>
            <div><Text type="secondary">状态：</Text>{detail?.is_published ? <Tag color="green">已发布</Tag> : <Tag color="orange">草稿</Tag>}</div>
            <div><Text type="secondary">能见度：</Text>{detail?.is_system ? <Tag color="purple">所有账号可见</Tag> : <Tag color="blue">仅自己</Tag>}</div>
            <div><Text type="secondary">版本：</Text>{detail?.version || detail?.active_version?.version_no || '-'}</div>
            <div><Text type="secondary">字段数：</Text>{model.fieldCount}</div>
          </div>
          {detail?.description ? (
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">描述：</Text>
              <Text>{detail.description}</Text>
            </div>
          ) : null}
        </div>
        <Divider style={{ margin: '12px 0' }} />
        {model.sections.some(section => section.groups.some(group => group.fields.length > 0)) ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {model.sections.map((section) => (
              <div key={section.id} style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '8px 12px', background: token.colorFillQuaternary, fontWeight: 600 }}>
                  {section.title}
                </div>
                {section.groups.map((group) => (
                  <div key={group.id} style={{ padding: '10px 12px' }}>
                    <div style={{ marginBottom: 8, color: token.colorTextSecondary, fontWeight: 600 }}>{group.title}</div>
                    <div style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: fieldGridColumns, gap: 8, padding: '7px 10px', background: token.colorFillTertiary, fontSize: 12, color: token.colorTextSecondary }}>
                        <span>序号</span>
                        <span>字段名称</span>
                        <span>字段标识</span>
                        <span>类型</span>
                        <span>说明 / 选项</span>
                      </div>
                      {group.fields.map((field, index) => (
                        <div
                          key={`${group.id}:${field.path}:${index}`}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: fieldGridColumns,
                            gap: 8,
                            padding: '8px 10px',
                            borderTop: `1px solid ${token.colorBorderSecondary}`,
                            alignItems: 'start',
                            fontSize: 13,
                          }}
                        >
                          <Text type="secondary">{index + 1}</Text>
                          <div style={{ paddingLeft: field.depth * 16, minWidth: 0 }}>
                            <Text style={{ fontWeight: field.depth === 0 ? 500 : 400 }}>{field.name}</Text>
                            <div style={{ marginTop: 4 }}>
                              {field.required ? <Tag color="red" style={{ marginInlineEnd: 4 }}>必填</Tag> : null}
                              {field.sensitive ? <Tag color="orange" style={{ marginInlineEnd: 4 }}>敏感</Tag> : null}
                              {!field.editable ? <Tag style={{ marginInlineEnd: 4 }}>只读</Tag> : null}
                            </div>
                          </div>
                          <Text code style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>{field.key || '-'}</Text>
                          <Tag style={{ width: 'fit-content' }}>{field.typeLabel}</Tag>
                          <div style={{ minWidth: 0 }}>
                            {field.description ? <Text>{field.description}</Text> : <Text type="secondary">-</Text>}
                            {field.options.length ? (
                              <div style={{ marginTop: 4 }}>
                                <Text type="secondary">选项：</Text>
                                <Text>{field.options.join(' / ')}</Text>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </Space>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无字段信息" />
        )}
      </>
    )}
  </Modal>
)

export default TemplatePreviewModal
