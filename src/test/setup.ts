import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom no implementa los diálogos modales: lo justo para probar la vista ampliada.
const dialogProto = HTMLDialogElement.prototype as Partial<HTMLDialogElement>;
if (typeof dialogProto.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
    // Como en el navegador: el foco pasa al primer control habilitado del diálogo.
    this.querySelector<HTMLElement>('button:not([disabled]), [href], input, [tabindex]')?.focus();
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

afterEach(() => {
  cleanup();
});
