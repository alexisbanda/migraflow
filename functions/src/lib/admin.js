const { initializeApp, getApps } = require('firebase-admin/app')
const { getFirestore }           = require('firebase-admin/firestore')
const { getStorage }             = require('firebase-admin/storage')
const { getAuth }                = require('firebase-admin/auth')

// Inicializar una sola vez (idempotente para hot-reloads en emulador)
if (!getApps().length) {
  initializeApp()
}

const db      = getFirestore()
const storage = getStorage()
const auth    = getAuth()

module.exports = { db, storage, auth }
