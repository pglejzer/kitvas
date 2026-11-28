<script lang="ts">
import AcmeButton from './Button.vue';

export default {
  name: 'AcmeCard',
  components: { AcmeButton },
  props: {
    title: { type: String, required: true },
    actionLabel: { type: String, required: true },
  },
};
</script>

<template>
  <div class="card">
    <h3 class="title">{{ title }}</h3>
    <div class="body"><slot /></div>
    <AcmeButton class="action">{{ actionLabel }}</AcmeButton>
  </div>
</template>

<style lang="scss" scoped>
$muted: #5b6678;
$line: #c3cde0;

.card {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 320px;
  padding: 24px;
  border: 1px solid $line;
  border-radius: 8px;
  background: #ffffff;
}

.title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  line-height: 24px;
  color: var(--acme-ink);
}

.body {
  font-size: 14px;
  font-weight: 400;
  line-height: 20px;
  color: $muted;
}

.action {
  align-self: flex-start;
}
</style>
