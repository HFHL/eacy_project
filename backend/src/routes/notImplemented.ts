import { Request, Response } from 'express'

export const notImplemented = (feature: string) => {
  return (_req: Request, res: Response) => {
    res.status(501).json({
      success: false,
      code: 501,
      message: `${feature} 暂未实现`,
      data: null
    })
  }
}
