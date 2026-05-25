import { replaceCliName, resolveCliName } from "./cli-name.js";
import { theme } from "../terminal/theme.js";

export type HelpExample = readonly [command: string, description: string];

export function formatHelpExample(command: string, description: string): string {
  return `  ${theme.command(replaceCliName(command, resolveCliName()))}\n    ${theme.muted(description)}`;
}

export function formatHelpExampleLine(command: string, description: string): string {
  const displayCommand = replaceCliName(command, resolveCliName());
  if (!description) {
    return `  ${theme.command(displayCommand)}`;
  }
  return `  ${theme.command(displayCommand)} ${theme.muted(`# ${description}`)}`;
}

export function formatHelpExamples(examples: ReadonlyArray<HelpExample>, inline = false): string {
  const formatter = inline ? formatHelpExampleLine : formatHelpExample;
  return examples.map(([command, description]) => formatter(command, description)).join("\n");
}

export function formatHelpExampleGroup(
  label: string,
  examples: ReadonlyArray<HelpExample>,
  inline = false,
) {
  return `${theme.muted(label)}\n${formatHelpExamples(examples, inline)}`;
}
