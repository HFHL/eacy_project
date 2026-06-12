import React from 'react'
import { ArrowRightOutlined } from '@ant-design/icons'

import { promoStyles as styles } from './promoStyles'

export const PromoPanel = () => (
  <div style={styles.promoPanel}>
    <div style={styles.promoShapes}>
      <div style={{ ...styles.shape, ...styles.shape1 }} />
      <div style={{ ...styles.shape, ...styles.shape2 }} />
      <div style={{ ...styles.shape, ...styles.shape3 }} />
      <div style={{ ...styles.shape, ...styles.shape4 }} />
    </div>

    <div style={styles.promoContent}>
      <div style={styles.promoLogo}>
        <span style={styles.logoText}>易悉</span>
        <span style={styles.logoSubtext}>EACY</span>
      </div>
      <h1 style={styles.promoTitle}>智能医疗数据平台</h1>
      <div style={styles.promoSubtitle}>
        <div style={styles.promoFeature}>
          <span style={styles.featureDot} />
          AI驱动的科研数据管理
        </div>
        <div style={styles.promoFeature}>
          <span style={styles.featureDot} />
          智能文档识别与结构化
        </div>
        <div style={styles.promoFeature}>
          <span style={styles.featureDot} />
          标准化CRF设计与数据采集
        </div>
      </div>
      <button style={styles.promoButton} onClick={() => window.open('#', '_blank')} type="button">
        了解更多
        <ArrowRightOutlined style={{ marginLeft: 8 }} />
      </button>
    </div>

    <div style={styles.copyright}>
      © 2024 易悉EACY. All rights reserved.
    </div>
  </div>
)
