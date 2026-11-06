/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async function testCollapse() {
  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  await openChatTab();
  ok(BrowserTestUtils.isVisible(document.getElementById("chatPanel")));

  const conversation = account.prplAccount.wrappedJSObject.makeDM("collapse");
  const convNode = getConversationItem(conversation);
  ok(convNode);

  await EventUtils.synthesizeMouseAtCenter(convNode, {});

  const chatConv = getChatConversationElement(conversation);
  ok(chatConv, "found conversation");
  ok(BrowserTestUtils.isVisible(chatConv), "conversation visible");
  const messageParent = await getChatMessageParent(chatConv);

  await addNotice(conversation, chatConv);

  is(
    messageParent.querySelector(".event-row:nth-child(1) .message-content")
      .textContent,
    "test notice",
    "notice added to conv"
  );

  await addNotice(conversation, chatConv);
  await addNotice(conversation, chatConv);
  await addNotice(conversation, chatConv);
  await Promise.all([
    await addNotice(conversation, chatConv),
    BrowserTestUtils.waitForMutationCondition(
      messageParent,
      {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class"],
      },
      () => messageParent.querySelector(".hide-children")
    ),
  ]);

  const hiddenGroup = messageParent.querySelector(".hide-children");
  const toggle = hiddenGroup.querySelector(".event-toggle");
  ok(toggle);
  Assert.greaterOrEqual(hiddenGroup.querySelectorAll(".event-row").length, 5);

  toggle.click();
  await BrowserTestUtils.waitForMutationCondition(
    hiddenGroup,
    {
      attributes: true,
      attributeFilter: ["class"],
    },
    () => !hiddenGroup.classList.contains("hide-children")
  );

  conversation.close();
  account.disconnect();
  const loginUpdate = TestUtils.topicObserved("passwordmgr-storage-changed");
  IMServices.accounts.deleteAccount(account.id);
  await loginUpdate; // Ensure login removal.
});

add_task(async function testGrouping() {
  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  await openChatTab();
  ok(
    BrowserTestUtils.isVisible(document.getElementById("chatPanel")),
    "Chat tab is visible"
  );

  const conversation = account.prplAccount.wrappedJSObject.makeDM("grouping");
  const convNode = getConversationItem(conversation);
  ok(convNode, "Conversation is in contacts list");

  await EventUtils.synthesizeMouseAtCenter(convNode, {});

  const chatConv = getChatConversationElement(conversation);
  ok(chatConv, "Found conversation element");
  ok(BrowserTestUtils.isVisible(chatConv), "conversation visible");
  const messageParent = await getChatMessageParent(chatConv);

  conversation.addMessages([
    {
      who: "grouping",
      content: "system message",
      options: {
        system: true,
        incoming: true,
      },
    },
    {
      who: "grouping",
      content: "normal message",
      options: {
        incoming: true,
      },
    },
    {
      who: "grouping",
      content: "another system message",
      options: {
        system: true,
        incoming: true,
      },
    },
  ]);
  // Wait for at least one event.
  do {
    await BrowserTestUtils.waitForEvent(
      chatConv.convBrowser,
      "MessagesDisplayed"
    );
  } while (chatConv.convBrowser.getPendingMessagesCount() > 0);

  for (const child of messageParent.children) {
    isnot(child.id, "insert", "Message element is not the insert point");
  }
  is(
    messageParent.childElementCount,
    3,
    "All three messages are their own top level element"
  );

  conversation.close();
  account.disconnect();
  const loginUpdate = TestUtils.topicObserved("passwordmgr-storage-changed");
  IMServices.accounts.deleteAccount(account.id);
  await loginUpdate; // Ensure login removal.
});

add_task(async function testSystemMessageReplacement() {
  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  await openChatTab();
  ok(
    BrowserTestUtils.isVisible(document.getElementById("chatPanel")),
    "Chat tab is visible"
  );

  const conversation = account.prplAccount.wrappedJSObject.makeDM("replacing");
  const convNode = getConversationItem(conversation);
  ok(convNode, "Conversation is in contacts list");

  await EventUtils.synthesizeMouseAtCenter(convNode, {});

  const chatConv = getChatConversationElement(conversation);
  ok(chatConv, "Found conversation element");
  ok(BrowserTestUtils.isVisible(chatConv), "conversation visible");
  const messageParent = await getChatMessageParent(chatConv);

  conversation.addMessages([
    {
      who: "replacing",
      content: "system message",
      options: {
        system: true,
        incoming: true,
        remoteId: "foo",
      },
    },
    {
      who: "replacing",
      content: "another system message",
      options: {
        system: true,
        incoming: true,
        remoteId: "bar",
      },
    },
  ]);
  // Wait for at least one event.
  do {
    await BrowserTestUtils.waitForEvent(
      chatConv.convBrowser,
      "MessagesDisplayed"
    );
  } while (chatConv.convBrowser.getPendingMessagesCount() > 0);

  const updateTextPromise = waitForNotification(conversation, "update-text");
  conversation.updateMessage("replacing", "better system message", {
    system: true,
    incoming: true,
    remoteId: "foo",
  });
  await updateTextPromise;
  await TestUtils.waitForTick();

  is(messageParent.childElementCount, 1, "Only one message group in browser");
  is(
    messageParent.firstElementChild.childElementCount,
    3,
    "Has two messages plus insert inside group"
  );
  const firstMessage = messageParent.firstElementChild.firstElementChild;
  ok(
    firstMessage.classList.contains("event-row"),
    "Replacement message is an event-row"
  );
  is(firstMessage.dataset.remoteId, "foo");
  is(
    firstMessage.querySelector(".message-content").textContent,
    "better system message",
    "Message content was updated"
  );

  conversation.close();
  account.disconnect();
  const loginUpdate = TestUtils.topicObserved("passwordmgr-storage-changed");
  IMServices.accounts.deleteAccount(account.id);
  await loginUpdate; // Ensure login removal.
});

add_task(async function testRenameCollapse() {
  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  await openChatTab();
  ok(BrowserTestUtils.isVisible(document.getElementById("chatPanel")));

  const conversation = account.prplAccount.wrappedJSObject.makeMUC("renames");
  const convNode = getConversationItem(conversation);
  ok(convNode);

  await EventUtils.synthesizeMouseAtCenter(convNode, {});

  const chatConv = getChatConversationElement(conversation);
  ok(chatConv, "found conversation");
  ok(BrowserTestUtils.isVisible(chatConv), "conversation visible");
  const messageParent = await getChatMessageParent(chatConv);

  conversation.addParticipant("user0");
  for (let i = 0; i < 20; i++) {
    conversation.updateNick(`user${i}`, `user${i + 1}`, false);
    // Live protocol events arrive one at a time: wait for this event to be
    // rendered and processed before adding the next one.
    await BrowserTestUtils.waitForMutationCondition(
      messageParent,
      { childList: true, subtree: true },
      () => messageParent.querySelectorAll(".event-row").length == i + 1
    );
  }

  const hiddenGroup = messageParent.querySelector(".hide-children");
  ok(hiddenGroup, "consecutive rename events collapse");
  ok(
    hiddenGroup?.querySelector(".event-toggle"),
    "collapsed group has a toggle"
  );
  Assert.greaterOrEqual(
    hiddenGroup?.querySelectorAll(".event-row").length ?? 0,
    20,
    "group holds all the rename events"
  );
  is(
    hiddenGroup.querySelectorAll(".event-collapsed").length,
    18,
    "middle rename events are hidden, only first and last visible"
  );

  conversation.close();
  account.disconnect();
  const loginUpdate = TestUtils.topicObserved("passwordmgr-storage-changed");
  IMServices.accounts.deleteAccount(account.id);
  await loginUpdate; // Ensure login removal.
});

add_task(async function testReopenHistory() {
  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  await openChatTab();
  ok(BrowserTestUtils.isVisible(document.getElementById("chatPanel")));

  const conversation = account.prplAccount.wrappedJSObject.makeMUC("history");
  const convNode = getConversationItem(conversation);
  ok(convNode);

  await EventUtils.synthesizeMouseAtCenter(convNode, {});

  const chatConv = getChatConversationElement(conversation);
  ok(chatConv, "found conversation");
  ok(BrowserTestUtils.isVisible(chatConv), "conversation visible");
  const messageParent = await getChatMessageParent(chatConv);

  conversation.addParticipant("user0");
  conversation.addParticipant("alice");
  conversation.writeMessage("alice", "before the renames", {
    incoming: true,
  });
  for (let i = 0; i < 30; i++) {
    // A busy channel: a run of consecutive rename events.
    conversation.updateNick(`user${i}`, `user${i + 1}`, false);
  }
  for (let i = 0; i < 20; i++) {
    conversation.writeMessage("alice", `after the renames ${i}`, {
      incoming: true,
    });
  }
  do {
    await BrowserTestUtils.waitForEvent(
      chatConv.convBrowser,
      "MessagesDisplayed"
    );
  } while (chatConv.convBrowser.getPendingMessagesCount() > 0);

  is(
    messageParent.querySelectorAll(".message.incoming").length,
    21,
    "normal messages displayed before reopening"
  );
  Assert.greaterOrEqual(
    messageParent.querySelectorAll(".event-row").length,
    30,
    "rename events displayed before reopening"
  );

  // Close and reopen the chat tab: the in-memory history is replayed.
  await closeChatTab();
  await openChatTab();

  const reopenedNode = getConversationItem(conversation);
  ok(reopenedNode, "conversation still listed after tab close");
  await EventUtils.synthesizeMouseAtCenter(reopenedNode, {});

  const reopenedChat = getChatConversationElement(conversation);
  ok(reopenedChat, "reopened conversation");
  const reopenedParent = reopenedChat.convBrowser.contentChatNode;
  await TestUtils.waitForCondition(
    () => reopenedParent.querySelectorAll(".message.incoming").length == 21,
    "normal messages displayed after reopening",
    50_000
  );
  const hiddenGroup = reopenedParent.querySelector(".hide-children");
  ok(hiddenGroup, "consecutive rename events collapse after reopening");
  Assert.greaterOrEqual(
    hiddenGroup?.querySelectorAll(".event-row").length ?? 0,
    30,
    "group holds all the rename events after reopening"
  );

  conversation.close();
  account.disconnect();
  const loginUpdate = TestUtils.topicObserved("passwordmgr-storage-changed");
  IMServices.accounts.deleteAccount(account.id);
  await loginUpdate; // Ensure login removal.
});

add_task(async function test_timeNotClipped() {
  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  await openChatTab();
  Assert.ok(BrowserTestUtils.isVisible(document.getElementById("chatPanel")));

  const conversation = account.prplAccount.wrappedJSObject.makeDM("clipping");
  const convNode = getConversationItem(conversation);
  Assert.ok(convNode, "conversation is in the contacts list");

  await EventUtils.synthesizeMouseAtCenter(convNode, {});

  const chatConv = getChatConversationElement(conversation);
  Assert.ok(chatConv, "found conversation");
  Assert.ok(BrowserTestUtils.isVisible(chatConv), "conversation visible");
  const messageParent = await getChatMessageParent(chatConv);

  conversation.addMessages([
    {
      who: "clipping",
      content: "hello",
      options: {
        incoming: true,
        time: new Date(2020, 0, 1, 13, 49).getTime() / 1000,
      },
    },
  ]);
  do {
    await BrowserTestUtils.waitForEvent(
      chatConv.convBrowser,
      "MessagesDisplayed"
    );
  } while (chatConv.convBrowser.getPendingMessagesCount() > 0);

  const message = messageParent.querySelector(".message.incoming");
  const sidebar = message.querySelector(".message-sidebar");
  const time = message.querySelector(".message-time");
  Assert.equal(time.textContent, "13:49", "the timestamp shows both digits");
  Assert.ok(
    BrowserTestUtils.isHidden(message.querySelector(".message-sender-time")),
    "the sender line has no timestamp in the default style"
  );

  // A larger message font must not push the timestamp outside of the sidebar,
  // where the overflowing text would be clipped by the #Chat overflow guard.
  chatConv.convBrowser.contentDocument.documentElement.style.fontSize = "50px";
  const { left: timeLeft } = time.getBoundingClientRect();
  const { left: sidebarLeft } = sidebar.getBoundingClientRect();
  Assert.greaterOrEqual(
    timeLeft,
    sidebarLeft - 1,
    "the timestamp stays inside its sidebar"
  );

  conversation.close();
  account.disconnect();
  const loginUpdate = TestUtils.topicObserved("passwordmgr-storage-changed");
  IMServices.accounts.deleteAccount(account.id);
  await loginUpdate; // Ensure login removal.
});

add_task(async function test_senderColors() {
  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  await openChatTab();

  const conversation = account.prplAccount.wrappedJSObject.makeDM("colors");
  const convNode = getConversationItem(conversation);
  await EventUtils.synthesizeMouseAtCenter(convNode, {});

  const chatConv = getChatConversationElement(conversation);
  const messageParent = await getChatMessageParent(chatConv);

  conversation.addMessages([
    { who: "colors", content: "in", options: { incoming: true } },
    { who: "me", content: "out", options: { outgoing: true } },
  ]);
  do {
    await BrowserTestUtils.waitForEvent(
      chatConv.convBrowser,
      "MessagesDisplayed"
    );
  } while (chatConv.convBrowser.getPendingMessagesCount() > 0);

  const doc = chatConv.convBrowser.contentWindow;
  for (const direction of ["incoming", "outgoing"]) {
    const message = messageParent.querySelector(`.message.${direction}`);
    const sender = doc.getComputedStyle(
      message.querySelector(".message-sender")
    ).color;
    const body = doc.getComputedStyle(
      message.querySelector(".message-content")
    ).color;
    Assert.notEqual(
      sender,
      body,
      `the ${direction} sender is colored in the default style`
    );
  }

  conversation.close();
  account.disconnect();
  const loginUpdate = TestUtils.topicObserved("passwordmgr-storage-changed");
  IMServices.accounts.deleteAccount(account.id);
  await loginUpdate; // Ensure login removal.
});

function addNotice(conversation, uiConversation) {
  conversation.addNotice();
  return BrowserTestUtils.waitForEvent(
    uiConversation.convBrowser,
    "MessagesDisplayed"
  );
}
