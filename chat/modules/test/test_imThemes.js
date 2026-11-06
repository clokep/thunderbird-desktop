/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {
  applyDisplayOptions,
  initHTMLDocument,
  insertHTMLForMessage,
  getHTMLForMessage,
  replaceHTMLForMessage,
  wasNextMessage,
  removeMessage,
  isNextMessage,
} = ChromeUtils.importESModule("resource:///modules/imThemes.sys.mjs");
const { MockDocument } = ChromeUtils.importESModule(
  "resource://testing-common/MockDocument.sys.mjs"
);

const BASIC_CONV_DOCUMENT_HTML =
  '<!DOCTYPE html><html><body><div id="Chat"></div></body></html>';

function makeConversation(userIcon = null) {
  return {
    account: {
      protocol: { name: "test" },
      statusInfo: { getUserIcon: () => userIcon },
    },
  };
}

add_task(function test_initHTMLDocument() {
  const window = {};
  const document = MockDocument.createTestDocument(
    "chrome://chat/content/conv.html",
    "<!DOCTYPE html><html><head></head><body></body></html>"
  );
  Object.defineProperty(document, "defaultView", {
    value: window,
  });
  const conversation = {
    title: "test",
  };
  initHTMLDocument(conversation, document, { bubbles: true, avatars: true });

  equal(document.title, "test");
  equal(typeof document.defaultView.convertTimeUnits, "function");

  for (const href of [
    "chrome://chat/skin/conv.css",
    "chrome://chat/skin/bubbles.css",
    "chrome://messenger/skin/icons.css",
    "chrome://messenger/skin/colors.css",
    "chrome://messenger/skin/layout.css",
    "chrome://messenger/skin/spacings.css",
  ]) {
    ok(
      document.querySelector(`link[rel="stylesheet"][href="${href}"]`),
      `stylesheet ${href} should be linked`
    );
  }
  ok(!document.querySelector("base"), "no base element should be added");

  equal(document.body.id, "ibcontent");
  const chat = document.getElementById("Chat");
  ok(chat);
  equal(chat.dataset.bubbles, "true");
  equal(chat.dataset.avatars, "true");

  equal(
    document.querySelector("script").src,
    "chrome://chat/content/conversation-behavior.js"
  );
});

add_task(function test_applyDisplayOptions() {
  const document = MockDocument.createTestDocument(
    "chrome://chat/content/conv.html",
    BASIC_CONV_DOCUMENT_HTML
  );
  const chat = document.getElementById("Chat");

  applyDisplayOptions(document, { bubbles: true, avatars: false });
  equal(chat.dataset.bubbles, "true");
  equal(chat.dataset.avatars, "false");

  applyDisplayOptions(document, { bubbles: false, avatars: true });
  equal(chat.dataset.bubbles, "false");
  equal(chat.dataset.avatars, "true");

  applyDisplayOptions(document, {});
  equal(chat.dataset.bubbles, "false");
  equal(chat.dataset.avatars, "false");
});

add_task(function test_insertHTMLForMessage() {
  const document = MockDocument.createTestDocument(
    "chrome://chat/content/conv.html",
    BASIC_CONV_DOCUMENT_HTML
  );
  const html = '<div style="background: blue;">foo bar</div>';
  const message = {};
  insertHTMLForMessage(message, html, document, false);
  const messageElement = document.querySelector("#Chat > div");
  strictEqual(messageElement._originalMsg, message);
  equal(messageElement.style.backgroundColor, "blue");
  equal(messageElement.textContent, "foo bar");
  ok(!messageElement.dataset.isNext);
});

add_task(function test_insertHTMLForMessage_next() {
  const document = MockDocument.createTestDocument(
    "chrome://chat/content/conv.html",
    BASIC_CONV_DOCUMENT_HTML
  );
  const html = '<div style="background: blue;">foo bar</div>';
  const message = {};
  insertHTMLForMessage(message, html, document, true);
  const messageElement = document.querySelector("#Chat > div");
  strictEqual(messageElement._originalMsg, message);
  equal(messageElement.style.backgroundColor, "blue");
  equal(messageElement.textContent, "foo bar");
  ok(messageElement.dataset.isNext);
});

add_task(function test_getHTMLForMessage_incoming() {
  const message = {
    incoming: true,
    message: "foo bar",
    who: "userId",
    alias: "display name",
    color: "color: #ffbbff",
    conversation: makeConversation(),
  };
  const html = getHTMLForMessage(message, {});

  ok(html.startsWith('<div class="message incoming"'), html);
  ok(html.includes('data-time="'), html);
  ok(html.includes('data-prpl="test"'), html);
  ok(html.includes('<div class="message-sidebar">'), html);
  ok(html.includes('<time class="message-time">'), html);
  ok(!html.includes("message-avatar"), html);
  ok(
    html.includes(
      '<span class="message-sender" style="color: #ffbbff"><span class="ib-sender">display name</span><time class="message-sender-time">'
    ),
    `sender line carries the timestamp: ${html}`
  );
  ok(
    html.includes('style="--sender-color: #ffbbff"'),
    `sender color is exposed to CSS: ${html}`
  );
  ok(html.includes('<span class="ib-msg-txt">foo bar</span>'), html);
  ok(html.includes('<footer class="message-footer" hidden></footer>'), html);
});

add_task(function test_getHTMLForMessage_outgoing_avatar_encrypted() {
  const message = {
    outgoing: true,
    iconURL: "https://example.com/icon.png",
    isEncrypted: true,
    message: "foo bar",
    who: "userId",
    color: "color: red",
    conversation: makeConversation(),
  };
  const html = getHTMLForMessage(message, {});

  ok(html.startsWith('<div class="message outgoing"'), html);
  ok(
    html.includes(
      '<img class="message-avatar" src="https://example.com/icon.png" alt="">'
    ),
    html
  );
  ok(
    html.includes(
      '<span class="message-sender message-encrypted" style="color: red">'
    ),
    html
  );
  ok(
    html.includes('style="--sender-color: red"'),
    `sender color is exposed to CSS: ${html}`
  );
});

add_task(function test_getHTMLForMessage_without_sender_color() {
  const message = {
    incoming: true,
    message: "foo bar",
    who: "userId",
    conversation: makeConversation(),
  };
  const html = getHTMLForMessage(message, {});

  ok(
    !html.includes("--sender-color"),
    `no sender color when the message has none: ${html}`
  );
});

add_task(function test_getHTMLForMessage_time() {
  const message = {
    incoming: true,
    message: "foo bar",
    who: "userId",
    time: 1600000000,
    conversation: makeConversation(),
  };
  const html = getHTMLForMessage(message, {});
  const match = html.match(/<time class="message-time">([^<]*)<\/time>/);
  ok(match, `message includes a formatted time: ${html}`);
  ok(
    /^\d{2}:\d{2}$/.test(match[1]),
    `message time is formatted as HH:MM, got "${match[1]}"`
  );

  const inlineMatch = html.match(
    /<time class="message-sender-time">([^<]*)<\/time>/
  );
  ok(inlineMatch, `sender line includes a formatted time: ${html}`);
  ok(
    /^\d{2}:\d{2}$/.test(inlineMatch[1]),
    `sender line time is formatted as HH:MM, got "${inlineMatch[1]}"`
  );
  equal(inlineMatch[1], match[1], "sender line and sidebar show the same time");

  const systemMessage = {
    system: true,
    message: "foo bar",
    time: 1600000000,
    conversation: makeConversation(),
  };
  const systemHtml = getHTMLForMessage(systemMessage, {});
  const systemMatch = systemHtml.match(
    /<time class="message-time">([^<]*)<\/time>/
  );
  ok(systemMatch, `system message includes a formatted time: ${systemHtml}`);
  ok(
    /^\d{2}:\d{2}$/.test(systemMatch[1]),
    `system message time is formatted as HH:MM, got "${systemMatch[1]}"`
  );
  ok(
    !systemHtml.includes("message-sender-time"),
    `system messages have no sender timestamp: ${systemHtml}`
  );
});

add_task(function test_getHTMLForMessage_next_context() {
  const message = {
    incoming: true,
    message: "foo bar",
    who: "userId",
    conversation: makeConversation(),
  };
  const html = getHTMLForMessage(message, { isNext: true, isContext: true });

  ok(
    html.startsWith('<div class="message incoming consecutive context"'),
    html
  );
});

add_task(function test_getHTMLForMessage_system() {
  const message = {
    system: true,
    message: "foo bar",
    conversation: makeConversation(),
  };
  const html = getHTMLForMessage(message, {});

  ok(html.includes('class="message event'), html);
  ok(html.includes('<div class="event-row '), html);
  ok(html.includes('<div class="message-sidebar">'), html);
  ok(!html.includes("message-sender"), html);
  ok(html.includes('<span class="ib-msg-txt">foo bar</span>'), html);
});

add_task(function test_getHTMLForMessage_system_next() {
  const message = {
    system: true,
    message: "foo bar",
    conversation: makeConversation(),
  };
  const html = getHTMLForMessage(message, { isNext: true });

  // Consecutive system events produce a flat row fragment (no wrapper div)
  // so the row becomes a sibling inside the group container.
  ok(html.startsWith('<div class="event-row '), html);
  ok(html.includes("consecutive"), html);
  ok(html.includes('<div id="insert"></div>'), html);
  ok(!html.startsWith('<div class="message event"'), html);
});

add_task(function test_getHTMLForMessage_action() {
  const message = {
    outgoing: true,
    action: true,
    message: "foo bar",
    who: "userId",
    conversation: makeConversation(),
  };
  const html = getHTMLForMessage(message, {});

  ok(html.startsWith('<div class="message outgoing action"'), html);
});

add_task(function test_replaceHTMLForMessage() {
  const document = MockDocument.createTestDocument(
    "chrome://chat/content/conv.html",
    BASIC_CONV_DOCUMENT_HTML
  );
  const html = '<div style="background: blue;">foo bar</div>';
  const message = {
    remoteId: "foo",
  };
  insertHTMLForMessage(message, html, document, false);
  const messageElement = document.querySelector("#Chat > div");
  strictEqual(messageElement._originalMsg, message);
  equal(messageElement.style.backgroundColor, "blue");
  equal(messageElement.textContent, "foo bar");
  equal(messageElement.dataset.remoteId, "foo");
  ok(!messageElement.dataset.isNext);
  const updatedHtml =
    '<div style="background: green;">lorem ipsum</div><div id="insert"></div>';
  const updatedMessage = {
    remoteId: "foo",
  };
  replaceHTMLForMessage(updatedMessage, updatedHtml, document, true);
  const updatedMessageElement = document.querySelector("#Chat > div");
  strictEqual(updatedMessageElement._originalMsg, updatedMessage);
  equal(updatedMessageElement.style.backgroundColor, "green");
  equal(updatedMessageElement.textContent, "lorem ipsum");
  equal(updatedMessageElement.dataset.remoteId, "foo");
  ok(updatedMessageElement.dataset.isNext);
  ok(
    !document.querySelector("#insert"),
    "Insert anchor in template is ignored when replacing"
  );
});

add_task(function test_replaceHTMLForMessageWithoutExistingMessage() {
  const document = MockDocument.createTestDocument(
    "chrome://chat/content/conv.html",
    BASIC_CONV_DOCUMENT_HTML
  );
  const updatedHtml = '<div style="background: green;">lorem ipsum</div>';
  const updatedMessage = {
    remoteId: "foo",
  };
  replaceHTMLForMessage(updatedMessage, updatedHtml, document, false);
  const updatedMessageElement = document.querySelector("#Chat > div");
  ok(!updatedMessageElement);
});

add_task(function test_replaceHTMLForMessageWithoutRemoteId() {
  const document = MockDocument.createTestDocument(
    "chrome://chat/content/conv.html",
    BASIC_CONV_DOCUMENT_HTML
  );
  const html = '<div style="background: blue;">foo bar</div>';
  const message = {
    remoteId: "foo",
  };
  insertHTMLForMessage(message, html, document, false);
  const messageElement = document.querySelector("#Chat > div");
  strictEqual(messageElement._originalMsg, message);
  equal(messageElement.style.backgroundColor, "blue");
  equal(messageElement.textContent, "foo bar");
  equal(messageElement.dataset.remoteId, "foo");
  ok(!messageElement.dataset.isNext);
  const updatedHtml = '<div style="background: green;">lorem ipsum</div>';
  const updatedMessage = {};
  replaceHTMLForMessage(updatedMessage, updatedHtml, document, false);
  const updatedMessageElement = document.querySelector("#Chat > div");
  strictEqual(updatedMessageElement._originalMsg, message);
  equal(updatedMessageElement.style.backgroundColor, "blue");
  equal(updatedMessageElement.textContent, "foo bar");
  equal(updatedMessageElement.dataset.remoteId, "foo");
  ok(!updatedMessageElement.dataset.isNext);
});

add_task(function test_wasNextMessage_isNext() {
  const document = MockDocument.createTestDocument(
    "chrome://chat/content/conv.html",
    BASIC_CONV_DOCUMENT_HTML
  );
  const html = "<div>foo bar</div>";
  const message = {
    remoteId: "foo",
  };
  insertHTMLForMessage(message, html, document, true);
  ok(wasNextMessage(message, document));
});

add_task(function test_wasNextMessage_isNotNext() {
  const document = MockDocument.createTestDocument(
    "chrome://chat/content/conv.html",
    BASIC_CONV_DOCUMENT_HTML
  );
  const html = "<div>foo bar</div>";
  const message = {
    remoteId: "foo",
  };
  insertHTMLForMessage(message, html, document, false);
  ok(!wasNextMessage(message, document));
});

add_task(function test_wasNextMessage_noPreviousVersion() {
  const document = MockDocument.createTestDocument(
    "chrome://chat/content/conv.html",
    BASIC_CONV_DOCUMENT_HTML
  );
  const message = {
    remoteId: "foo",
  };
  ok(!wasNextMessage(message, document));
});

add_task(function test_removeMessage() {
  const document = MockDocument.createTestDocument(
    "chrome://chat/content/conv.html",
    BASIC_CONV_DOCUMENT_HTML
  );
  const html = '<div style="background: blue;">foo bar</div>';
  const message = {
    remoteId: "foo",
  };
  insertHTMLForMessage(message, html, document, false);
  const messageElement = document.querySelector("#Chat > div");
  strictEqual(messageElement._originalMsg, message);
  equal(messageElement.style.backgroundColor, "blue");
  equal(messageElement.textContent, "foo bar");
  equal(messageElement.dataset.remoteId, "foo");
  ok(!messageElement.dataset.isNext);
  removeMessage("foo", document);
  const messageElements = document.querySelectorAll("#Chat > div");
  equal(messageElements.length, 0);
});

add_task(function test_removeMessage_noMatchingMessage() {
  const document = MockDocument.createTestDocument(
    "chrome://chat/content/conv.html",
    BASIC_CONV_DOCUMENT_HTML
  );
  const html = '<div style="background: blue;">foo bar</div>';
  const message = {
    remoteId: "foo",
  };
  insertHTMLForMessage(message, html, document, false);
  const messageElement = document.querySelector("#Chat > div");
  strictEqual(messageElement._originalMsg, message);
  equal(messageElement.style.backgroundColor, "blue");
  equal(messageElement.textContent, "foo bar");
  equal(messageElement.dataset.remoteId, "foo");
  ok(!messageElement.dataset.isNext);
  removeMessage("bar", document);
  const messageElements = document.querySelectorAll("#Chat > div");
  notEqual(messageElements.length, 0);
});

add_task(function test_isNextMessage() {
  const messagePairs = [
    {
      message: {},
      previousMessage: null,
      isNext: false,
    },
    {
      message: {
        system: true,
      },
      previousMessage: {
        system: true,
      },
      isNext: true,
    },
    {
      message: {
        who: "foo",
      },
      previousMessage: {
        who: "bar",
      },
      isNext: false,
    },
    {
      message: {
        outgoing: true,
      },
      isNext: false,
    },
    {
      message: {
        incoming: true,
      },
      isNext: false,
    },
    {
      message: {
        system: true,
      },
      isNext: false,
    },
    {
      message: {
        time: 100,
      },
      previousMessage: {
        time: 100,
      },
      isNext: true,
    },
    {
      message: {
        time: 300,
      },
      previousMessage: {
        time: 100,
      },
      isNext: true,
    },
    {
      message: {
        time: 500,
      },
      previousMessage: {
        time: 100,
      },
      isNext: false,
    },
  ];

  const combineConsecutivePref =
    "messenger.options.messagesStyle.combineConsecutive";
  const combineConsecutiveIntervalPref =
    "messenger.options.messagesStyle.combineConsecutiveInterval";

  Services.prefs.setBoolPref(combineConsecutivePref, true);
  Services.prefs.setIntPref(combineConsecutiveIntervalPref, 300);
  for (const { message, previousMessage = {}, isNext } of messagePairs) {
    equal(
      isNextMessage(message, previousMessage),
      isNext,
      `unexpected isNext for ${JSON.stringify(message)}`
    );
  }

  Services.prefs.setBoolPref(combineConsecutivePref, false);
  for (const { message, previousMessage = {} } of messagePairs) {
    equal(
      isNextMessage(message, previousMessage),
      false,
      `combineConsecutive should gate isNext for ${JSON.stringify(message)}`
    );
  }

  Services.prefs.clearUserPref(combineConsecutivePref);
  Services.prefs.clearUserPref(combineConsecutiveIntervalPref);
});

add_task(function test_insertHTMLForMessage_systemGrouping() {
  const document = MockDocument.createTestDocument(
    "chrome://chat/content/conv.html",
    BASIC_CONV_DOCUMENT_HTML
  );
  const conv = makeConversation();
  const firstMsg = {
    system: true,
    message: "first",
    conversation: conv,
    remoteId: "a",
  };
  const firstHtml = getHTMLForMessage(firstMsg, {});
  insertHTMLForMessage(firstMsg, firstHtml, document, false);

  const group = document.querySelector("#Chat > .message.event");
  ok(group, "First event creates a .message.event group container");
  ok(group.querySelector("#insert"), "Group has an insert anchor");

  const secondMsg = {
    system: true,
    message: "second",
    conversation: conv,
    remoteId: "b",
  };
  const secondHtml = getHTMLForMessage(secondMsg, { isNext: true });
  insertHTMLForMessage(secondMsg, secondHtml, document, true);

  const rows = group.querySelectorAll(":scope > .event-row");
  equal(rows.length, 2, "Events are flat siblings inside the group");
  equal(
    rows[0].querySelector(".ib-msg-txt").textContent,
    "first",
    "First row contains the first message"
  );
  equal(
    rows[1].querySelector(".ib-msg-txt").textContent,
    "second",
    "Second row contains the second message"
  );
  ok(group.querySelector("#insert"), "Group still has its insert anchor");
  ok(rows[1].dataset.isNext, "isNext set on the subsequent row");
});
