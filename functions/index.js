/**
 * MigraFlow — Cloud Functions entry point
 *
 * Exportar aquí todas las funciones para que Firebase las registre.
 * Usar nombres explícitos evita colisiones y facilita el debugging en los logs.
 */

const { processDocumentOCR }       = require('./src/processDocumentOCR')
const { generateMigratoryPackage } = require('./src/generateMigratoryPackage')
const { createAgencyAdmin }        = require('./src/createAgencyAdmin')

exports.processDocumentOCR       = processDocumentOCR
exports.generateMigratoryPackage = generateMigratoryPackage
exports.createAgencyAdmin        = createAgencyAdmin
