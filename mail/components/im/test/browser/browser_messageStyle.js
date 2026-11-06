/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const BUBBLES_PREF = "messenger.options.messagesStyle.bubbles";
const AVATARS_PREF = "messenger.options.messagesStyle.avatars";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      [BUBBLES_PREF, false],
      [AVATARS_PREF, false],
    ],
  });
});

add_task(async function testDisplayOptionsChangeOpenConversation() {
  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  await openChatTab();

  const conversation =
    account.prplAccount.wrappedJSObject.makeMUC("messageStyle");
  const convNode = getConversationItem(conversation);
  ok(convNode);

  conversation.writeMessage("mochitest", "hello world", {
    incoming: true,
  });

  EventUtils.synthesizeMouseAtCenter(convNode, {});

  const chatConv = getChatConversationElement(conversation);
  ok(chatConv, "found conversation");
  const browserDisplayed = BrowserTestUtils.waitForEvent(
    chatConv.convBrowser,
    "MessagesDisplayed"
  );
  const messageParent = await getChatMessageParent(chatConv);
  await browserDisplayed;

  ok(
    messageParent.textContent.includes("hello world"),
    "message added to conv"
  );

  const contentDocument = chatConv.convBrowser.contentDocument;
  const chatNode = chatConv.convBrowser.contentChatNode;
  is(chatNode.dataset.bubbles, "false", "the bubbles style is off");
  is(chatNode.dataset.avatars, "false", "avatars are off");

  await SpecialPowers.pushPrefEnv({ set: [[BUBBLES_PREF, true]] });
  await TestUtils.waitForCondition(
    () => chatNode.dataset.bubbles == "true",
    "the open conversation picks up the bubbles style"
  );
  is(chatNode.dataset.avatars, "false", "avatars are still off");
  is(
    chatConv.convBrowser.contentDocument,
    contentDocument,
    "the conversation was updated without reloading"
  );
  Assert.stringContains(
    chatConv.convBrowser.contentChatNode.textContent,
    "hello world",
    "message still displayed after enabling bubbles"
  );

  await SpecialPowers.pushPrefEnv({ set: [[AVATARS_PREF, true]] });
  await TestUtils.waitForCondition(
    () => chatNode.dataset.avatars == "true",
    "the open conversation picks up avatars"
  );
  is(chatNode.dataset.bubbles, "true", "the bubbles style is still on");
  Assert.stringContains(
    chatConv.convBrowser.contentChatNode.textContent,
    "hello world",
    "message still displayed after enabling avatars"
  );

  const messageDisplayed = BrowserTestUtils.waitForEvent(
    chatConv.convBrowser,
    "MessagesDisplayed"
  );
  conversation.writeMessage("mochitest", "after the change", {
    incoming: true,
  });
  await messageDisplayed;

  Assert.stringContains(
    chatConv.convBrowser.contentChatNode.textContent,
    "after the change",
    "message received after the prefs changed is displayed"
  );

  await SpecialPowers.popPrefEnv();
  await TestUtils.waitForCondition(
    () => chatNode.dataset.avatars == "false",
    "the open conversation drops avatars"
  );
  await SpecialPowers.popPrefEnv();
  await TestUtils.waitForCondition(
    () => chatNode.dataset.bubbles == "false",
    "the open conversation drops the bubbles style"
  );

  conversation.close();
  account.disconnect();
  IMServices.accounts.deleteAccount(account.id);
  await Promise.resolve(); // Ensure login removal.
});
