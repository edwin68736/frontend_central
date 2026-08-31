import { describe, it, expect } from 'vitest'
import { hasPermission } from './permissions'

describe('hasPermission', () => {
  it('superadmin tiene acceso total, incluso a un permiso inventado', () => {
    expect(hasPermission('superadmin', [], 'cualquier.cosa_inventada')).toBe(true)
    expect(hasPermission('SuperAdmin', undefined, 'roles.manage')).toBe(true)
  })

  it('usuario con el permiso exacto tiene acceso', () => {
    expect(hasPermission('admin', ['empresas.view'], 'empresas.view')).toBe(true)
  })

  it('usuario sin el permiso no tiene acceso', () => {
    expect(hasPermission('admin', ['empresas.view'], 'pagos.approve')).toBe(false)
  })

  it('"*" concede cualquier permiso', () => {
    expect(hasPermission('admin', ['*'], 'usuarios_central.destroy')).toBe(true)
  })

  it('permissions vacío o undefined no concede acceso (admin normal)', () => {
    expect(hasPermission('admin', [], 'dashboard.view')).toBe(false)
    expect(hasPermission('admin', undefined, 'dashboard.view')).toBe(false)
    expect(hasPermission('admin', null, 'dashboard.view')).toBe(false)
  })

  it('required vacío nunca concede acceso, ni para superadmin', () => {
    expect(hasPermission('admin', ['*'], '')).toBe(false)
    expect(hasPermission('superadmin', [], '')).toBe(false)
  })

  describe('.manage respeta EXACTAMENTE las mismas reglas del backend (saManageImpliedActions)', () => {
    it('facturador.manage implica view y sync, nada más', () => {
      expect(hasPermission('admin', ['facturador.manage'], 'facturador.view')).toBe(true)
      expect(hasPermission('admin', ['facturador.manage'], 'facturador.sync')).toBe(true)
      expect(hasPermission('admin', ['facturador.manage'], 'facturador.manage')).toBe(true) // coincidencia exacta
    })

    it('documentos.manage implica SOLO view — nunca approve_purchase (crítico, independiente)', () => {
      expect(hasPermission('admin', ['documentos.manage'], 'documentos.view')).toBe(true)
      expect(hasPermission('admin', ['documentos.manage'], 'documentos.approve_purchase')).toBe(false)
    })

    it('ajustes.manage implica SOLO view', () => {
      expect(hasPermission('admin', ['ajustes.manage'], 'ajustes.view')).toBe(true)
    })

    it('roles.manage implica view/create/update/delete — nunca usuarios_central.*', () => {
      expect(hasPermission('admin', ['roles.manage'], 'roles.view')).toBe(true)
      expect(hasPermission('admin', ['roles.manage'], 'roles.create')).toBe(true)
      expect(hasPermission('admin', ['roles.manage'], 'roles.update')).toBe(true)
      expect(hasPermission('admin', ['roles.manage'], 'roles.delete')).toBe(true)
      expect(hasPermission('admin', ['roles.manage'], 'usuarios_central.change_role')).toBe(false)
    })

    it('un módulo sin entrada en MANAGE_IMPLIED_ACTIONS no expande nada, aunque tenga .manage', () => {
      // "pagos" no tiene ningún ".manage" en el catálogo real, pero si alguien lo tuviera
      // igual no debe expandir a ninguna acción no listada explícitamente.
      expect(hasPermission('admin', ['pagos.manage'], 'pagos.view')).toBe(false)
    })
  })

  it('no confunde permisos de módulos distintos con el mismo sufijo de acción', () => {
    expect(hasPermission('admin', ['empresas.view'], 'fiscal.view')).toBe(false)
  })
})
