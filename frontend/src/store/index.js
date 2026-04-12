import { configureStore } from '@reduxjs/toolkit'
import userSlice from './slices/userSlice'
import patientSlice from './slices/patientSlice'
import documentSlice from './slices/documentSlice'
import crfSlice from './slices/crfSlice'
import projectSlice from './slices/projectSlice'
import uiSlice from './slices/uiSlice'

const store = configureStore({
  reducer: {
    user: userSlice,
    patient: patientSlice,
    document: documentSlice,
    crf: crfSlice,
    project: projectSlice,
    ui: uiSlice
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE']
      }
    }),
  devTools: process.env.NODE_ENV !== 'production'
})

export default store