// Private runtime barrel for the bundled Feishu extension.
// Keep this barrel thin and aligned with the local extension surface.

export * from "mechanical-wings/plugin-sdk/feishu";
export {
  isRequestBodyLimitError,
  readRequestBodyWithLimit,
  requestBodyErrorToText,
} from "mechanical-wings/plugin-sdk/webhook-ingress";
