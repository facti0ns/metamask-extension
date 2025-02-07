import {
  LedgerAction,
  OffscreenCommunicationEvents,
  OffscreenCommunicationTarget,
} from '../../shared/constants/offscreen-communication';
import { CallbackProcessor } from './callback-processor';

const LEDGER_FRAME_ORIGIN_URL = 'https://metamask.github.io';
const LEDGER_FRAME_TARGET = 'LEDGER-IFRAME';

/**
 * The ledger keyring iframe will send this event name when the ledger is
 * connected to the iframe.
 */
const LEDGER_KEYRING_IFRAME_CONNECTED_EVENT = 'ledger-connection-event';

const callbackProcessor = new CallbackProcessor();

const iframe = document.querySelector('iframe');

// This listener receives action responses from the live ledger iframe
// Then forwards the response to the offscreen bridge
window.addEventListener('message', ({ origin, data, source }) => {
  if (origin !== LEDGER_FRAME_ORIGIN_URL || source !== iframe?.contentWindow) {
    return;
  }

  if (data) {
    if (data.action === LEDGER_KEYRING_IFRAME_CONNECTED_EVENT) {
      chrome.runtime.sendMessage({
        action: OffscreenCommunicationEvents.ledgerDeviceConnect,
        payload: data.payload.connected,
      });

      return;
    }

    // Every message from the ledger iframe will have a messageId that was
    // assigned to it by the callbackProcessor. This messageId is used by the
    // callbackProcessor to trigger the appropriate callback from the
    // initiating request.
    callbackProcessor.processCallback(data);
  }
});

// This listener received action messages from the offscreen bridge
// Then it forwards the message to the live ledger iframe
chrome.runtime.onMessage.addListener(
  (
    msg: {
      target: string;
      action: LedgerAction;
      params: any;
    },
    _sender,
    sendResponse,
  ) => {
    if (msg.target !== OffscreenCommunicationTarget.ledgerOffscreen) {
      return;
    }

    if (!iframe?.contentWindow) {
      const error = new Error('Ledger iframe not present');
      sendResponse({
        success: false,
        payload: {
          error,
        },
      });
      return;
    }

    const messageId = callbackProcessor.registerCallback(sendResponse);
    // The ledger action constants use the same values as the ledger keyring
    // library expectations. That way we can just forward the message to the
    // iframe and it will be handled by the ledger keyring library. We append
    // the messageId which will be included in the response so that it can be
    // routed accordingly through the callback-processor.
    const iframeMsg = {
      ...msg,
      target: LEDGER_FRAME_TARGET,
      messageId,
    };

    // It has already been checked that they are not null above, so the
    // optional chaining here is for compiler typechecking only. This avoids
    // overriding our non-null assertion rule.
    iframe?.contentWindow?.postMessage(iframeMsg, LEDGER_FRAME_ORIGIN_URL);

    // This keeps sendResponse function valid after return
    // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onMessage
    // eslint-disable-next-line consistent-return
    return true;
  },
);
