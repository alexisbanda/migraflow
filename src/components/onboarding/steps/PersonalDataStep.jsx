import ClientOnboarding, { Field, Input, Select, useOnboarding } from '../ClientOnboarding'

const NATIONALITIES = [
  { value: 'VE', label: 'Venezuela' },
  { value: 'CO', label: 'Colombia' },
  { value: 'AR', label: 'Argentina' },
  { value: 'MX', label: 'México' },
  { value: 'MA', label: 'Marruecos' },
  { value: 'NG', label: 'Nigeria' },
  { value: 'CN', label: 'China' },
  { value: 'OTHER', label: 'Otra' },
]

export default function PersonalDataStep() {
  const { formData, errors, updateField } = useOnboarding()

  return (
    <ClientOnboarding.Step id="personal" title="Datos personales del cliente">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="Nombre" name="first_name" error={errors.first_name}>
          <Input
            name="first_name"
            value={formData.first_name}
            onChange={updateField}
            placeholder="Ej. Ana"
          />
        </Field>

        <Field label="Apellidos" name="last_name" error={errors.last_name}>
          <Input
            name="last_name"
            value={formData.last_name}
            onChange={updateField}
            placeholder="Ej. Martínez López"
          />
        </Field>

        <Field label="Correo electrónico" name="email" error={errors.email}>
          <Input
            name="email"
            type="email"
            value={formData.email}
            onChange={updateField}
            placeholder="cliente@email.com"
          />
        </Field>

        <Field label="Teléfono" name="phone" error={errors.phone}>
          <Input
            name="phone"
            type="tel"
            value={formData.phone}
            onChange={updateField}
            placeholder="+34 600 000 000"
          />
        </Field>

        <Field label="Fecha de nacimiento" name="dob" error={errors.dob}>
          <Input
            name="dob"
            type="date"
            value={formData.dob}
            onChange={updateField}
          />
        </Field>

        <Field label="Nacionalidad" name="nationality" error={errors.nationality}>
          <Select
            name="nationality"
            value={formData.nationality}
            onChange={updateField}
            options={NATIONALITIES}
            placeholder="Selecciona..."
          />
        </Field>
      </div>
    </ClientOnboarding.Step>
  )
}
