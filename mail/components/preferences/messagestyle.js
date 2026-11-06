/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from preferences.js */

var { GenericConvIMPrototype, GenericMessagePrototype } =
  ChromeUtils.importESModule("resource:///modules/jsProtoHelper.sys.mjs");

var { IMServices } = ChromeUtils.importESModule(
  "resource:///modules/IMServices.sys.mjs"
);

function Conversation(aName) {
  this._name = aName;
  this._observers = [];
  const now = new Date();
  this._date =
    new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 42, 22) *
    1000;
}
Conversation.prototype = {
  __proto__: GenericConvIMPrototype,
  account: {
    protocol: { name: "Fake Protocol" },
    alias: "",
    name: "Fake Account",
    get statusInfo() {
      return IMServices.core.globalUserStatus;
    },
  },
};

function Message(aWho, aMessage, aObject, aConversation) {
  this._init(aWho, aMessage, aObject, aConversation);
}
Message.prototype = {
  __proto__: GenericMessagePrototype,
  get displayMessage() {
    return this.originalMessage;
  },
};

var previewObserver = {
  _loaded: false,
  async load() {
    const makeDate = function (aDateString) {
      const array = aDateString.split(":");
      const now = new Date();
      return (
        new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          array[0],
          array[1],
          array[2]
        ) / 1000
      );
    };
    const ids = [
      "chat-theme-preview-nick-1",
      "chat-theme-preview-buddy-1",
      "chat-theme-preview-nick-2",
      "chat-theme-preview-buddy-2",
      "chat-theme-preview-message-1",
      "chat-theme-preview-message-2",
      "chat-theme-preview-message-3",
    ];
    const [nick1, buddy1, nick2, buddy2, message1, message2, message3] =
      await document.l10n.formatValues(ids);
    const conv = new Conversation(nick2);
    conv.messages = [
      new Message(
        buddy1,
        message1,
        {
          outgoing: true,
          _alias: nick1,
          time: makeDate("10:42:22"),
        },
        conv
      ),
      new Message(
        buddy1,
        message2,
        {
          outgoing: true,
          _alias: nick1,
          time: makeDate("10:42:25"),
        },
        conv
      ),
      new Message(
        buddy2,
        message3,
        {
          incoming: true,
          _alias: nick2,
          time: makeDate("10:43:01"),
        },
        conv
      ),
    ];
    previewObserver.conv = conv;

    previewObserver.browser = document.getElementById("previewbrowser");

    // If the preferences tab is opened straight to the message styles,
    // loading the preview fails. Pushing this to back of the event queue
    // prevents that failure.
    setTimeout(() => {
      previewObserver.reloadPreview();
      this._loaded = true;
    });
  },

  reloadPreview() {
    try {
      this.browser.init(this.conv);
      Services.obs.addObserver(this, "conversation-loaded");
    } catch (e) {
      // The conversation document failed to load. Show the fallback screen
      // instead of the preview.
      this.showNoPreview();
    }
  },

  showNoPreview() {
    const previewBoxBrowser = document
      .getElementById("previewBox")
      .querySelector("browser");
    if (previewBoxBrowser) {
      previewBoxBrowser.hidden = true;
    }
    document.getElementById("noPreviewScreen").hidden = false;
  },

  observe(aSubject, aTopic) {
    if (aTopic != "conversation-loaded" || aSubject != this.browser) {
      return;
    }

    // We want to avoid the convbrowser trying to scroll to the last
    // added message, as that causes the entire pref pane to jump up
    // (bug 1179943). Therefore, we override the method convbrowser
    // uses to determine if it should scroll, as well as its
    // mirror in the contentWindow (that conversation JS can call).
    this.browser.convScrollEnabled = () => false;
    this.browser.contentWindow.convScrollEnabled = () => false;

    // Display all queued messages. Use a timeout so that message text
    // modifiers can be added with observers for this notification.
    setTimeout(function () {
      for (const message of previewObserver.conv.messages) {
        aSubject.appendMessage(message, false);
      }
    }, 0);

    Services.obs.removeObserver(this, "conversation-loaded");
  },
};
