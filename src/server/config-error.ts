/** Invalid command-line options or environment. Shown to the user without a stack trace. */
class ConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export default ConfigError;
