import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type InventoryItem, proposeProtected } from '../../src/checks/index.ts';

type Part = Omit<InventoryItem, 'width' | 'read'>;

/** The items of one width, in page order, as the survey measured them. */
const at = (width: number, parts: Part[]): InventoryItem[] =>
  parts.map((part) => ({ ...part, width, read: 'measured' as const }));

const PHONE = at(390, [
  { kind: 'brand', text: 'Acme' },
  { kind: 'link', text: 'Pricing', href: '/pricing' },
  { kind: 'heading', text: 'Plans', level: 1 },
  { kind: 'action', text: 'Start free trial' },
  { kind: 'price', text: '$1,299.00' },
  { kind: 'field', text: 'Email' },
  { kind: 'link', text: 'Terms', href: '/terms' },
]);

const LAPTOP = at(1280, [
  { kind: 'brand', text: 'ACME' },
  { kind: 'link', text: 'Pricing', href: '/pricing' },
  { kind: 'link', text: 'Docs', href: '/docs' },
  { kind: 'heading', text: 'Plans', level: 1 },
  { kind: 'action', text: 'Talk to sales' },
  { kind: 'action', text: 'Start free trial' },
  { kind: 'price', text: '$1299' },
  { kind: 'price', text: '€49' },
  { kind: 'field', text: ' email ' },
  { kind: 'field', text: 'Company' },
  { kind: 'link', text: 'Terms', href: '/terms' },
]);

test('the proposal: brand, the first action at 1280, prices, fields and header links, once each', () => {
  assert.deepEqual(proposeProtected({ items: [...PHONE, ...LAPTOP] }), [
    { id: 'brand', kind: 'brand', find: 'Acme' },
    { id: 'cta', kind: 'action', find: 'Talk to sales' },
    { id: 'price-1', kind: 'price', find: '$1,299.00' },
    { id: 'price-2', kind: 'price', find: '€49' },
    { id: 'field-1', kind: 'field', find: 'Email' },
    { id: 'field-2', kind: 'field', find: 'Company' },
    { id: 'nav-1', kind: 'link', find: 'Pricing' },
    { id: 'nav-2', kind: 'link', find: 'Docs' },
  ]);
});

test('an empty inventory proposes nothing', () => {
  assert.deepEqual(proposeProtected({ items: [] }), []);
});

test('without a heading no link is taken for the header; without an h1 the first heading cuts', () => {
  const noHeading = at(1280, [
    { kind: 'link', text: 'Home' },
    { kind: 'link', text: 'Terms' },
  ]);
  assert.deepEqual(proposeProtected({ items: noHeading }), []);
  const noH1 = at(1280, [
    { kind: 'link', text: 'Home' },
    { kind: 'heading', text: 'Welcome', level: 2 },
    { kind: 'link', text: 'Terms' },
  ]);
  assert.deepEqual(proposeProtected({ items: noH1 }), [
    { id: 'nav-1', kind: 'link', find: 'Home' },
  ]);
});

test('read from an image: no action at 1280 falls back to the first one; blank texts are left out', () => {
  const read: InventoryItem[] = [
    { kind: 'brand', text: '  ', width: 390, read: 'read' },
    { kind: 'action', text: '', width: 390, read: 'read' },
    { kind: 'action', text: ' Book a demo ', width: 390, read: 'read' },
    { kind: 'price', text: 'Call us', width: 390, read: 'read' },
  ];
  assert.deepEqual(proposeProtected({ items: read }), [
    { id: 'cta', kind: 'action', find: 'Book a demo' },
    { id: 'price-1', kind: 'price', find: 'Call us' },
  ]);
});
