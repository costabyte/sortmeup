const TikTokVideoMetadata = require('../../types/TikTokVideoMetadata');

class TikTokEffectParser {
  static parse(qtInfo) {
    const effect = qtInfo?.data?.prop_list?.[0];
    if (!effect) return null;

    try {
      const content = JSON.parse(effect.content);
      return {
        type: TikTokVideoMetadata.EditorTypes.TIKTOK,
        effect: {
          name: effect.keyword || null,
          id: content.third_id || null,
          iconUrl: content.icon_url || null,
        },
      };
    } catch {
      return null;
    }
  }
}

module.exports = TikTokEffectParser;
