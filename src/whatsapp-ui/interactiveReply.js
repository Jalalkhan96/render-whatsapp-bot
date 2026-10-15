/**
 * Extract an ID from WhatsApp interactive responses.
 *
 * Handles:
 * - native flow replies
 * - quick replies
 * - list/single-select replies
 * - template/button replies
 */

function safeJsonParse(value) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function getInteractiveReplyId(msg) {
  const message = msg?.message;

  if (!message) {
    return null;
  }

  // ---------------------------------------------------------
  // Native Flow
  // ---------------------------------------------------------

  const nativeFlow =
    message?.interactiveResponseMessage
      ?.nativeFlowResponseMessage;

  if (nativeFlow?.paramsJson) {
    const params =
      safeJsonParse(
        nativeFlow.paramsJson
      );

    if (params?.id) {
      return params.id;
    }

    if (params?.selectedId) {
      return params.selectedId;
    }

    if (params?.buttonId) {
      return params.buttonId;
    }

    /*
     * Some WhatsApp clients return nested
     * buttonParamsJson.
     */
    if (params?.buttonParamsJson) {
      const nested =
        safeJsonParse(
          params.buttonParamsJson
        );

      return (
        nested?.id ||
        nested?.selectedId ||
        nested?.buttonId ||
        null
      );
    }
  }

  // ---------------------------------------------------------
  // Legacy button response
  // ---------------------------------------------------------

  const buttonResponse =
    message?.buttonsResponseMessage;

  if (
    buttonResponse?.selectedButtonId
  ) {
    return buttonResponse.selectedButtonId;
  }

  // ---------------------------------------------------------
  // List response
  // ---------------------------------------------------------

  const listResponse =
    message?.listResponseMessage;

  if (
    listResponse?.singleSelectReply
      ?.selectedRowId
  ) {
    return (
      listResponse
        .singleSelectReply
        .selectedRowId
    );
  }

  // ---------------------------------------------------------
  // Template button
  // ---------------------------------------------------------

  const templateResponse =
    message?.templateButtonReplyMessage;

  if (
    templateResponse?.selectedId
  ) {
    return templateResponse.selectedId;
  }

  return null;
}


/**
 * Convert an interactive ID into a bot command.
 *
 * Examples:
 *
 * menu_group
 *   -> /menu group
 *
 * menu_all
 *   -> /menu all
 *
 * menu_categories
 *   -> /menu categories
 *
 * ping
 *   -> /ping
 */
export function resolveInteractiveCommand(
  id,
  prefix = '/'
) {
  if (!id) {
    return null;
  }

  const value =
    String(id).trim();

  if (!value) {
    return null;
  }

  // Already a command.
  if (
    value.startsWith('/') ||
    value.startsWith('$')
  ) {
    return value;
  }

  if (
    value === 'menu_categories'
  ) {
    return `${prefix}menu categories`;
  }

  if (
    value === 'menu_all'
  ) {
    return `${prefix}menu all`;
  }

  if (
    value === 'menu_main'
  ) {
    return `${prefix}menu`;
  }

  if (
    value === 'menu_group'
  ) {
    return `${prefix}menu group`;
  }

  if (
    value.startsWith('menu_')
  ) {
    const category =
      value.slice('menu_'.length);

    if (category) {
      return `${prefix}menu ${category}`;
    }
  }

  return `${prefix}${value}`;
}