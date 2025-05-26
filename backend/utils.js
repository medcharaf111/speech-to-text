export function getVoiceLangCode(language) {
  switch (language) {
    case "ar":
      return "ar-XA";
    case "zh-CN":
      return "cmn-CN";
    case "bn":
      return "bn-IN";

    default:
      const locale = new Intl.Locale(language);
      const maximized = locale.maximize();
      const regionCode = maximized.region;
      return `${language}-${regionCode.toUpperCase()}`;
  }
}
