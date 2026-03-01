import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import ClientOnboarding, { Field, Input, useOnboarding } from '../ClientOnboarding'

function PassportDropzone({ onFile, preview }) {
  const onDrop = useCallback(
    (accepted) => {
      if (accepted[0]) onFile(accepted[0])
    },
    [onFile]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10 MB
  })

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
        ${
          isDragActive
            ? 'border-military-500 bg-military-900/20'
            : 'border-slate-700 hover:border-slate-500 bg-slate-800/40'
        }`}
    >
      <input {...getInputProps()} />

      {preview ? (
        <div className="flex items-center justify-center gap-3 text-sm text-slate-300">
          <svg className="w-8 h-8 text-military-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-medium">{preview}</span>
        </div>
      ) : isDragActive ? (
        <p className="text-military-400 text-sm font-medium">Suelta el archivo aquí...</p>
      ) : (
        <div className="space-y-2">
          <svg
            className="mx-auto w-10 h-10 text-slate-600"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-sm text-slate-400">
            Arrastra el pasaporte o{' '}
            <span className="text-military-400 font-medium underline underline-offset-2">
              haz clic para seleccionar
            </span>
          </p>
          <p className="text-xs text-slate-600">PDF, JPG o PNG · Máx. 10 MB</p>
        </div>
      )}
    </div>
  )
}

export default function PassportStep() {
  const { formData, errors, updateField } = useOnboarding()

  const handlePassportFile = (file) => {
    updateField('passport_file', file)
    updateField('passport_file_name', file.name)
  }

  return (
    <ClientOnboarding.Step id="passport" title="Datos del pasaporte">
      <div className="space-y-5">
        <PassportDropzone
          onFile={handlePassportFile}
          preview={formData.passport_file_name}
        />
        {errors.passport_file && (
          <p className="text-xs text-red-400">{errors.passport_file}</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Número de pasaporte" name="passport_number" error={errors.passport_number}>
            <Input
              name="passport_number"
              value={formData.passport_number}
              onChange={updateField}
              placeholder="Ej. XA1234567"
            />
          </Field>

          <Field label="Fecha de expiración" name="passport_expiry" error={errors.passport_expiry}>
            <Input
              name="passport_expiry"
              type="date"
              value={formData.passport_expiry}
              onChange={updateField}
            />
          </Field>
        </div>

        {/* Aviso RGPD */}
        <div className="flex gap-3 bg-slate-800/60 border border-slate-700 rounded-lg p-4">
          <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M12 3C6.477 3 2 7.477 2 12s4.477 9 10 9 10-4.477 10-9S17.523 3 12 3z" />
          </svg>
          <p className="text-xs text-slate-400 leading-relaxed">
            El documento se cifra y almacena de forma segura conforme al <strong className="text-slate-300">RGPD</strong>.
            Solo los abogados asignados a este expediente tendrán acceso.
          </p>
        </div>
      </div>
    </ClientOnboarding.Step>
  )
}
