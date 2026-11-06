/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { UIDensity } = ChromeUtils.importESModule(
  "resource:///modules/UIDensity.sys.mjs"
);

const BUBBLES_PREF = "messenger.options.messagesStyle.bubbles";
const AVATARS_PREF = "messenger.options.messagesStyle.avatars";

function makeAccount(protocol = "prpl-mochitest") {
  const account = IMServices.accounts.createAccount("testuser", protocol);
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  return { account, passwordPromise };
}

async function openConversation(account, name) {
  await openChatTab();
  ok(BrowserTestUtils.isVisible(document.getElementById("chatPanel")));

  const conversation = account.prplAccount.wrappedJSObject.makeDM(name);
  const convNode = getConversationItem(conversation);
  ok(convNode);

  await EventUtils.synthesizeMouseAtCenter(convNode, {});

  const chatConv = getChatConversationElement(conversation);
  ok(chatConv, "found conversation");
  ok(BrowserTestUtils.isVisible(chatConv), "conversation visible");
  await BrowserTestUtils.browserLoaded(chatConv.convBrowser);
  const contentDoc = chatConv.convBrowser.contentDocument;
  const messageParent = chatConv.convBrowser.contentChatNode;
  return { chatConv, conversation, contentDoc, messageParent };
}

async function closeConversation(account, conversation) {
  conversation.close();
  account.disconnect();
  const loginUpdate = TestUtils.topicObserved("passwordmgr-storage-changed");
  IMServices.accounts.deleteAccount(account.id);
  await loginUpdate; // Ensure login removal.
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      [BUBBLES_PREF, true],
      [AVATARS_PREF, true],
    ],
  });
});

add_task(async function testContentStyles() {
  const { account, passwordPromise } = makeAccount();
  await passwordPromise;
  account.connect();

  const { conversation, contentDoc } = await openConversation(
    account,
    "plumbing"
  );

  for (const stylesheet of [
    "chrome://messenger/skin/colors.css",
    "chrome://messenger/skin/layout.css",
    "chrome://messenger/skin/spacings.css",
  ]) {
    ok(
      contentDoc.querySelector(`link[href="${stylesheet}"]`),
      `${stylesheet} is linked in the conversation document`
    );
  }

  const chat = contentDoc.getElementById("Chat");
  is(chat.dataset.bubbles, "true", "bubbles style is announced");
  is(chat.dataset.avatars, "true", "avatars style is announced");

  await closeConversation(account, conversation);
});

add_task(async function testFormatInterval() {
  const { account, passwordPromise } = makeAccount();
  await passwordPromise;
  account.connect();

  const { conversation, contentDoc } = await openConversation(
    account,
    "interval"
  );

  await TestUtils.waitForCondition(
    () => typeof contentDoc.defaultView.formatInterval == "function",
    "conversation behavior script loaded"
  );

  Assert.equal(
    contentDoc.defaultView.formatInterval(3720),
    "1 h 2 m",
    "interval is formatted as hours and minutes"
  );
  Assert.equal(
    contentDoc.defaultView.formatInterval(7200),
    "2 h",
    "interval with no remaining minutes omits the minutes"
  );
  Assert.equal(
    contentDoc.defaultView.formatInterval(1800),
    "30 m",
    "interval under an hour is formatted as minutes"
  );

  await closeConversation(account, conversation);
});

add_task(async function test_bubblesTimestamp() {
  const { account, passwordPromise } = makeAccount();
  await passwordPromise;
  account.connect();

  const { chatConv, conversation, messageParent } = await openConversation(
    account,
    "bubbles-timestamp"
  );

  conversation.addMessages([
    {
      who: "bubbles-timestamp",
      content: "hello",
      options: {
        incoming: true,
        time: new Date(2020, 0, 1, 13, 49).getTime() / 1000,
      },
    },
    {
      who: "bubbles-timestamp",
      content: "left",
      options: {
        system: true,
        incoming: true,
        time: new Date(2020, 0, 1, 13, 50).getTime() / 1000,
      },
    },
  ]);
  do {
    await BrowserTestUtils.waitForEvent(
      chatConv.convBrowser,
      "MessagesDisplayed"
    );
  } while (chatConv.convBrowser.getPendingMessagesCount() > 0);

  const message = messageParent.querySelector(".message.incoming:not(.event)");
  const time = message.querySelector(".message-sender-time");
  Assert.ok(time, "the sender line carries a timestamp");
  Assert.equal(
    time.textContent,
    "13:49",
    "the sender line shows the message time"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(time),
    "the timestamp is hidden until the message is hovered"
  );

  await BrowserTestUtils.synthesizeMouseAtCenter(
    ".message-content",
    { type: "mousemove" },
    chatConv.convBrowser
  );
  Assert.ok(
    BrowserTestUtils.isVisible(time),
    "the timestamp is revealed while the message is hovered"
  );

  const eventTime = messageParent.querySelector(".event-row .message-time");
  Assert.ok(eventTime, "events carry a timestamp");
  Assert.ok(
    BrowserTestUtils.isVisible(eventTime),
    "event timestamps stay visible in the bubbles style"
  );

  await closeConversation(account, conversation);
});

add_task(async function testUidensityMirror() {
  const { account, passwordPromise } = makeAccount();
  await passwordPromise;
  account.connect();

  const { conversation, contentDoc } = await openConversation(
    account,
    "density"
  );
  const { documentElement } = contentDoc;

  await UIDensity.setMode(UIDensity.MODE_TOUCH);
  await TestUtils.waitForCondition(
    () => documentElement.getAttribute("uidensity") === "touch",
    "density change is mirrored to the conversation document"
  );

  await UIDensity.setMode(UIDensity.MODE_COMPACT);
  await TestUtils.waitForCondition(
    () => documentElement.getAttribute("uidensity") === "compact",
    "compact density is mirrored to the conversation document"
  );

  await closeConversation(account, conversation);
});

registerCleanupFunction(async () => {
  await UIDensity.setMode(UIDensity.MODE_NORMAL);
  await SpecialPowers.popPrefEnv();
});
