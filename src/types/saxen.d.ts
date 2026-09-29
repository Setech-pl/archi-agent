declare module "saxen" {
  export class Parser {
    on(event: "openTag", callback: (name: string, attributes: () => Record<string, string>, decode: (value: string) => string) => void): this;
    on(event: "closeTag", callback: (name: string) => void): this;
    on(event: "error" | "warn", callback: () => void): this;
    on(event: "attention", callback: (value: string) => void): this;
    write(chunk: string): this;
    end(): unknown;
  }
}
