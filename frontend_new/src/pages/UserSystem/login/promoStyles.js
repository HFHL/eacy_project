import { appThemeToken } from '../../../styles/themeTokens'

export const promoStyles = {
  promoPanel: {
    flex: 1,
    background: `linear-gradient(135deg, ${appThemeToken.colorPrimary} 0%, rgba(24, 144, 255, 0.82) 50%, rgba(24, 144, 255, 0.68) 100%)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  promoShapes: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  },
  shape: {
    position: 'absolute',
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.1)',
  },
  shape1: {
    width: 300,
    height: 300,
    top: '-5%',
    right: '-5%',
    animation: 'float1 8s ease-in-out infinite',
  },
  shape2: {
    width: 200,
    height: 200,
    bottom: '10%',
    left: '5%',
    animation: 'float2 10s ease-in-out infinite',
  },
  shape3: {
    width: 150,
    height: 150,
    top: '40%',
    right: '20%',
    animation: 'float3 7s ease-in-out infinite',
  },
  shape4: {
    width: 100,
    height: 100,
    bottom: '30%',
    right: '10%',
    animation: 'pulse 4s ease-in-out infinite',
  },
  promoContent: {
    textAlign: 'center',
    zIndex: 1,
    padding: 40,
    color: 'white',
  },
  promoLogo: {
    marginBottom: 30,
  },
  logoText: {
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: 8,
    textShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
  },
  logoSubtext: {
    fontSize: 24,
    fontWeight: 300,
    marginLeft: 12,
    opacity: 0.9,
    letterSpacing: 4,
  },
  promoTitle: {
    fontSize: 24,
    fontWeight: 500,
    marginBottom: 32,
    opacity: 0.95,
    letterSpacing: 2,
  },
  promoSubtitle: {
    marginBottom: 40,
  },
  promoFeature: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    opacity: 0.85,
    marginBottom: 12,
    letterSpacing: 1,
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.8)',
    marginRight: 12,
  },
  promoButton: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '14px 36px',
    background: 'rgba(255, 255, 255, 0.15)',
    color: 'white',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.3s',
    backdropFilter: 'blur(10px)',
  },
  copyright: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
  },
}

export const auxiliaryStyles = {
  helpLinks: {
    textAlign: 'center',
    fontSize: 12,
    color: appThemeToken.colorTextSecondary,
    paddingTop: 20,
    borderTop: `1px solid ${appThemeToken.colorBorder}`,
    marginTop: 'auto',
  },
  helpLink: {
    color: appThemeToken.colorTextSecondary,
    textDecoration: 'none',
    transition: 'color 0.3s',
  },
  helpDivider: {
    margin: '0 12px',
    color: appThemeToken.colorTextTertiary,
  },
}

export const animationStyle = `
  @keyframes float1 {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    50% { transform: translateY(-30px) rotate(5deg); }
  }
  @keyframes float2 {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    50% { transform: translateY(-20px) rotate(-5deg); }
  }
  @keyframes float3 {
    0%, 100% { transform: translateY(0) scale(1); }
    50% { transform: translateY(-25px) scale(1.1); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 0.3; }
  }
`
