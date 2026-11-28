<script lang="ts">
export default {
  name: 'AcmeField',
  props: {
    label: { type: String, required: true },
    name: { type: String, required: true },
    placeholder: { type: String, default: '' },
    value: { type: String, default: '' },
  },
};
</script>

<template>
  <div class="field">
    <label class="caption" :for="name">{{ label }}</label>
    <input
      class="input"
      type="text"
      :id="name"
      :name="name"
      :placeholder="placeholder"
      :value="value"
    />
  </div>
</template>

<style lang="scss" scoped>
$ink: #1a2233;
$line: #c3cde0;
$primary: #1f5fd0;

.field {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: Arial, Helvetica, sans-serif;
  color: $ink;

  .caption {
    font-size: 14px;
    font-weight: 600;
    line-height: 20px;
    color: $ink;
  }

  .input {
    box-sizing: border-box;
    width: 240px;
    margin: 0;
    padding: 8px 12px;
    border: 1px solid $line;
    border-radius: 6px;
    background: #ffffff;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 14px;
    font-weight: 400;
    line-height: 20px;
    letter-spacing: normal;
    text-align: left;
    text-transform: none;
    color: $ink;

    &:focus {
      border-color: $primary;
      outline: 2px solid $primary;
      outline-offset: 0;
    }
  }
}
</style>
