<script lang="ts">
export default {
  name: 'AcmeButton',
  props: {
    variant: { type: String, default: 'primary' },
    disabled: { type: Boolean, default: false },
  },
};
</script>

<template>
  <button
    type="button"
    class="btn"
    :class="`btn-${variant}`"
    :disabled="disabled"
  ><span class="label"><slot /></span></button>
</template>

<style lang="scss" scoped>
$primary: #1f5fd0;
$primary-hover: #184fae;
$primary-active: #123d88;
$on-primary: #ffffff;
$line: #c3cde0;
$tint: #eef3fc;
$tint-active: #dde7f9;

.btn {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 8px 16px;
  border: 1px solid transparent;
  border-radius: 6px;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  letter-spacing: normal;
  text-align: center;
  text-transform: none;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid $primary;
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.label {
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}

.btn-primary {
  border-color: $primary;
  background: $primary;
  color: $on-primary;

  &:hover:not(:disabled) {
    border-color: $primary-hover;
    background: $primary-hover;
  }

  &:active:not(:disabled) {
    border-color: $primary-active;
    background: $primary-active;
  }
}

.btn-quiet {
  border-color: $line;
  background: transparent;
  color: $primary;

  &:hover:not(:disabled) {
    background: $tint;
  }

  &:active:not(:disabled) {
    background: $tint-active;
  }
}
</style>
