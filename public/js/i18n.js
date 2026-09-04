class I18n {
  constructor() {
    this.currentLocale = localStorage.getItem('photodrop_lang') || this.detectLocale();
    this.translations = {};
  }

  detectLocale() {
    const navLang = navigator.language || navigator.userLanguage || 'fr';
    return navLang.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  }

  async init() {
    await this.loadLocale(this.currentLocale);
    this.translatePage();
  }

  async loadLocale(locale) {
    try {
      const response = await fetch(`/locales/${locale}.json`);
      if (!response.ok) {
        throw new Error(`Failed to load locale ${locale}`);
      }
      this.translations = await response.json();
      this.currentLocale = locale;
      localStorage.setItem('photodrop_lang', locale);
      document.documentElement.lang = locale;
    } catch (err) {
      console.error('Error loading locale:', err);
      if (locale !== 'en') {
        await this.loadLocale('en');
      }
    }
  }

  t(key, params = {}) {
    const keys = key.split('.');
    let value = this.translations;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return key;
      }
    }

    if (typeof value === 'string') {
      let result = value;
      for (const [paramKey, paramValue] of Object.entries(params)) {
        result = result.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
      }
      return result;
    }

    return key;
  }

  translatePage() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        el.textContent = this.t(key);
      }
    });

    const placeholders = document.querySelectorAll('[data-i18n-placeholder]');
    placeholders.forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) {
        el.setAttribute('placeholder', this.t(key));
      }
    });

    const titles = document.querySelectorAll('[data-i18n-title]');
    titles.forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      if (key) {
        el.setAttribute('title', this.t(key));
      }
    });
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 ' + this.t('common.bytes');
    const k = 1024;
    const sizes = [
      this.t('common.bytes'),
      this.t('common.kilobytes'),
      this.t('common.megabytes'),
      this.t('common.gigabytes')
    ];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const formatted = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
    return `${formatted} ${sizes[i]}`;
  }

  async setLocale(locale) {
    await this.loadLocale(locale);
    this.translatePage();
    window.dispatchEvent(new CustomEvent('localeChanged', { detail: { locale } }));
  }
}

export const i18n = new I18n();
