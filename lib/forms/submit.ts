export function createSubmitLock() {
  let locked = false;

  return {
    get isLocked() {
      return locked;
    },
    tryAcquire() {
      if (locked) return false;
      locked = true;
      return true;
    },
    release() {
      locked = false;
    },
  };
}

export function focusFirstInvalidField(form: HTMLFormElement, fieldName?: string): void {
  const named = fieldName ? form.elements.namedItem(fieldName) : null;
  const namedElement = named instanceof RadioNodeList ? named[0] : named;
  if (namedElement instanceof HTMLElement) {
    namedElement.focus();
    return;
  }

  const invalid = form.querySelector<HTMLElement>("[aria-invalid='true'], :invalid");
  invalid?.focus();
}
