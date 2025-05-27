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

export function filterVoices(res, lang) {
  res = res.map((item) => ({ ...item, languageCodes: item.languageCodes[0] }));

  const pick = (gender, count) =>
    res
      .filter((v) => v.languageCodes === lang && v.ssmlGender === gender)
      .sort(
        (a, b) =>
          b.name.includes("Chirp3") - a.name.includes("Chirp3") ||
          b.name.includes("Standard") - a.name.includes("Standard")
      )
      .slice(0, count);

  return [...pick("FEMALE", 3), ...pick("MALE", 2)];
}
