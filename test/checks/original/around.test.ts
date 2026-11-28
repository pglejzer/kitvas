import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aroundPage, usedElsewhere } from '../../../src/checks/domain/kit/original-around.ts';

test('the page of an example is the first class of its outermost element', () => {
  const around = [
    { attributes: { class: ' profile-page dark ' } },
    { attributes: { class: 'user-info' } },
  ];
  assert.equal(aroundPage(around), 'profile-page');
  assert.equal(aroundPage([{ attributes: {} }]), undefined);
  assert.equal(aroundPage([]), undefined);
  assert.equal(aroundPage(undefined), undefined);
});

test('a file that uses the tag without the page is where the component stands elsewhere', () => {
  const files = [
    { file: 'src/profile.html', text: '<div class="profile-page"><app-follow-button />' },
    {
      file: 'src/article.html',
      text: '<div class="article-page"><app-follow-button></app-follow-button>',
    },
    { file: 'src/home.html', text: '<div class="home-page"><app-favorite-button />' },
    { file: 'src/follow.ts', text: "selector: 'app-follow-button'" },
    { file: 'src/icon.html', text: '<app-follow-button-icon></app-follow-button-icon>' },
  ];
  assert.deepEqual(usedElsewhere(files, 'app-follow-button', 'profile-page', []), [
    'src/article.html',
  ]);
  assert.deepEqual(usedElsewhere(files, 'PopularTags', 'home-page', []), []);
});

test('a file of another kit component is no page: where that component stands counts', () => {
  const owners = [
    { name: 'CommentList', files: ['src/CommentList.vue'] },
    { name: 'Comment', files: ['src/Comment.vue'] },
  ];
  const files = [
    { file: 'src/Comment.vue', text: '<template><div class="card"><Comment v-if="reply" /></div>' },
    { file: 'src/CommentList.vue', text: '<template><ul><Comment v-for="c in list" /></ul>' },
    { file: 'src/pages/Article.vue', text: '<div class="article-page"><CommentList /></div>' },
  ];
  // The list stands only on the article page, so the comment does too; its own file is never a page.
  assert.deepEqual(usedElsewhere(files, 'Comment', 'article-page', owners), []);
  const elsewhere = [
    ...files,
    { file: 'src/pages/Inbox.vue', text: '<main class="inbox"><CommentList /></main>' },
  ];
  assert.deepEqual(usedElsewhere(elsewhere, 'Comment', 'article-page', owners), [
    'src/pages/Inbox.vue',
  ]);
});
