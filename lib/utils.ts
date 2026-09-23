import { cn } from "cn";

export { cn };

export function joinClassNames(...values: Array<string | false | null | undefined>) {
  return cn(...values);
}
