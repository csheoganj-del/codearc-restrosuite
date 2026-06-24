/* ============================================================
   RestroSuite — Country & Currency Data
   Comprehensive list of countries with their currencies.
   Used by: login.html (registration), features-shell.js (settings)
   ============================================================ */
(function () {
  'use strict';

  /* ---------- Full country → currency map ---------- */
  window.RS_COUNTRIES = [
    { name: 'Afghanistan',           code: 'AF', dial: '93',  currency: 'AFN (؋)',  symbol: '؋', currencyCode: 'AFN', currencyName: 'Afghan Afghani' },
    { name: 'Albania',               code: 'AL', dial: '355', currency: 'ALL (L)',  symbol: 'L', currencyCode: 'ALL', currencyName: 'Albanian Lek' },
    { name: 'Algeria',               code: 'DZ', dial: '213', currency: 'DZD (د.ج)', symbol: 'د.ج', currencyCode: 'DZD', currencyName: 'Algerian Dinar' },
    { name: 'Argentina',             code: 'AR', dial: '54',  currency: 'ARS ($)',  symbol: '$', currencyCode: 'ARS', currencyName: 'Argentine Peso' },
    { name: 'Armenia',               code: 'AM', dial: '374', currency: 'AMD (֏)',  symbol: '֏', currencyCode: 'AMD', currencyName: 'Armenian Dram' },
    { name: 'Australia',             code: 'AU', dial: '61',  currency: 'AUD ($)',  symbol: '$', currencyCode: 'AUD', currencyName: 'Australian Dollar' },
    { name: 'Austria',               code: 'AT', dial: '43',  currency: 'EUR (€)',  symbol: '€', currencyCode: 'EUR', currencyName: 'Euro' },
    { name: 'Azerbaijan',            code: 'AZ', dial: '994', currency: 'AZN (₼)',  symbol: '₼', currencyCode: 'AZN', currencyName: 'Azerbaijani Manat' },
    { name: 'Bahrain',               code: 'BH', dial: '973', currency: 'BHD (BD)', symbol: 'BD', currencyCode: 'BHD', currencyName: 'Bahraini Dinar' },
    { name: 'Bangladesh',            code: 'BD', dial: '880', currency: 'BDT (৳)',  symbol: '৳', currencyCode: 'BDT', currencyName: 'Bangladeshi Taka' },
    { name: 'Belarus',               code: 'BY', dial: '375', currency: 'BYN (Br)', symbol: 'Br', currencyCode: 'BYN', currencyName: 'Belarusian Ruble' },
    { name: 'Belgium',               code: 'BE', dial: '32',  currency: 'EUR (€)',  symbol: '€', currencyCode: 'EUR', currencyName: 'Euro' },
    { name: 'Belize',                code: 'BZ', dial: '501', currency: 'BZD ($)',  symbol: '$', currencyCode: 'BZD', currencyName: 'Belize Dollar' },
    { name: 'Bolivia',               code: 'BO', dial: '591', currency: 'BOB (Bs.)', symbol: 'Bs.', currencyCode: 'BOB', currencyName: 'Bolivian Boliviano' },
    { name: 'Bosnia & Herzegovina',  code: 'BA', dial: '387', currency: 'BAM (KM)', symbol: 'KM', currencyCode: 'BAM', currencyName: 'Bosnian Mark' },
    { name: 'Botswana',              code: 'BW', dial: '267', currency: 'BWP (P)',  symbol: 'P', currencyCode: 'BWP', currencyName: 'Botswana Pula' },
    { name: 'Brazil',                code: 'BR', dial: '55',  currency: 'BRL (R$)', symbol: 'R$', currencyCode: 'BRL', currencyName: 'Brazilian Real' },
    { name: 'Bulgaria',              code: 'BG', dial: '359', currency: 'BGN (лв)', symbol: 'лв', currencyCode: 'BGN', currencyName: 'Bulgarian Lev' },
    { name: 'Cambodia',              code: 'KH', dial: '855', currency: 'KHR (៛)',  symbol: '៛', currencyCode: 'KHR', currencyName: 'Cambodian Riel' },
    { name: 'Canada',                code: 'CA', dial: '1',   currency: 'CAD ($)',  symbol: '$', currencyCode: 'CAD', currencyName: 'Canadian Dollar' },
    { name: 'Chile',                 code: 'CL', dial: '56',  currency: 'CLP ($)',  symbol: '$', currencyCode: 'CLP', currencyName: 'Chilean Peso' },
    { name: 'China',                 code: 'CN', dial: '86',  currency: 'CNY (¥)',  symbol: '¥', currencyCode: 'CNY', currencyName: 'Chinese Yuan' },
    { name: 'Colombia',              code: 'CO', dial: '57',  currency: 'COP ($)',  symbol: '$', currencyCode: 'COP', currencyName: 'Colombian Peso' },
    { name: 'Costa Rica',            code: 'CR', dial: '506', currency: 'CRC (₡)',  symbol: '₡', currencyCode: 'CRC', currencyName: 'Costa Rican Colón' },
    { name: 'Croatia',               code: 'HR', dial: '385', currency: 'EUR (€)',  symbol: '€', currencyCode: 'EUR', currencyName: 'Euro' },
    { name: 'Cuba',                  code: 'CU', dial: '53',  currency: 'CUP ($)',  symbol: '$', currencyCode: 'CUP', currencyName: 'Cuban Peso' },
    { name: 'Cyprus',                code: 'CY', dial: '357', currency: 'EUR (€)',  symbol: '€', currencyCode: 'EUR', currencyName: 'Euro' },
    { name: 'Czech Republic',        code: 'CZ', dial: '420', currency: 'CZK (Kč)', symbol: 'Kč', currencyCode: 'CZK', currencyName: 'Czech Koruna' },
    { name: 'Denmark',               code: 'DK', dial: '45',  currency: 'DKK (kr)', symbol: 'kr', currencyCode: 'DKK', currencyName: 'Danish Krone' },
    { name: 'Dominican Republic',    code: 'DO', dial: '1',   currency: 'DOP (RD$)', symbol: 'RD$', currencyCode: 'DOP', currencyName: 'Dominican Peso' },
    { name: 'Ecuador',               code: 'EC', dial: '593', currency: 'USD ($)',  symbol: '$', currencyCode: 'USD', currencyName: 'US Dollar' },
    { name: 'Egypt',                 code: 'EG', dial: '20',  currency: 'EGP (LE)', symbol: 'LE', currencyCode: 'EGP', currencyName: 'Egyptian Pound' },
    { name: 'El Salvador',           code: 'SV', dial: '503', currency: 'USD ($)',  symbol: '$', currencyCode: 'USD', currencyName: 'US Dollar' },
    { name: 'Estonia',               code: 'EE', dial: '372', currency: 'EUR (€)',  symbol: '€', currencyCode: 'EUR', currencyName: 'Euro' },
    { name: 'Ethiopia',              code: 'ET', dial: '251', currency: 'ETB (Br)', symbol: 'Br', currencyCode: 'ETB', currencyName: 'Ethiopian Birr' },
    { name: 'Finland',               code: 'FI', dial: '358', currency: 'EUR (€)',  symbol: '€', currencyCode: 'EUR', currencyName: 'Euro' },
    { name: 'France',                code: 'FR', dial: '33',  currency: 'EUR (€)',  symbol: '€', currencyCode: 'EUR', currencyName: 'Euro' },
    { name: 'Georgia',               code: 'GE', dial: '995', currency: 'GEL (₾)',  symbol: '₾', currencyCode: 'GEL', currencyName: 'Georgian Lari' },
    { name: 'Germany',               code: 'DE', dial: '49',  currency: 'EUR (€)',  symbol: '€', currencyCode: 'EUR', currencyName: 'Euro' },
    { name: 'Ghana',                 code: 'GH', dial: '233', currency: 'GHS (₵)',  symbol: '₵', currencyCode: 'GHS', currencyName: 'Ghanaian Cedi' },
    { name: 'Greece',                code: 'GR', dial: '30',  currency: 'EUR (€)',  symbol: '€', currencyCode: 'EUR', currencyName: 'Euro' },
    { name: 'Guatemala',             code: 'GT', dial: '502', currency: 'GTQ (Q)',  symbol: 'Q', currencyCode: 'GTQ', currencyName: 'Guatemalan Quetzal' },
    { name: 'Honduras',              code: 'HN', dial: '504', currency: 'HNL (L)',  symbol: 'L', currencyCode: 'HNL', currencyName: 'Honduran Lempira' },
    { name: 'Hong Kong',             code: 'HK', dial: '852', currency: 'HKD ($)',  symbol: '$', currencyCode: 'HKD', currencyName: 'Hong Kong Dollar' },
    { name: 'Hungary',               code: 'HU', dial: '36',  currency: 'HUF (Ft)', symbol: 'Ft', currencyCode: 'HUF', currencyName: 'Hungarian Forint' },
    { name: 'Iceland',               code: 'IS', dial: '354', currency: 'ISK (kr)', symbol: 'kr', currencyCode: 'ISK', currencyName: 'Icelandic Króna' },
    { name: 'India',                 code: 'IN', dial: '91',  currency: 'INR (₹)',  symbol: '₹', currencyCode: 'INR', currencyName: 'Indian Rupee' },
    { name: 'Indonesia',             code: 'ID', dial: '62',  currency: 'IDR (Rp)', symbol: 'Rp', currencyCode: 'IDR', currencyName: 'Indonesian Rupiah' },
    { name: 'Iran',                  code: 'IR', dial: '98',  currency: 'IRR (﷼)', symbol: '﷼', currencyCode: 'IRR', currencyName: 'Iranian Rial' },
    { name: 'Iraq',                  code: 'IQ', dial: '964', currency: 'IQD (ع.د)', symbol: 'ع.د', currencyCode: 'IQD', currencyName: 'Iraqi Dinar' },
    { name: 'Ireland',               code: 'IE', dial: '353', currency: 'EUR (€)',  symbol: '€', currencyCode: 'EUR', currencyName: 'Euro' },
    { name: 'Israel',                code: 'IL', dial: '972', currency: 'ILS (₪)',  symbol: '₪', currencyCode: 'ILS', currencyName: 'Israeli New Shekel' },
    { name: 'Italy',                 code: 'IT', dial: '39',  currency: 'EUR (€)',  symbol: '€', currencyCode: 'EUR', currencyName: 'Euro' },
    { name: 'Jamaica',               code: 'JM', dial: '1',   currency: 'JMD ($)',  symbol: '$', currencyCode: 'JMD', currencyName: 'Jamaican Dollar' },
    { name: 'Japan',                 code: 'JP', dial: '81',  currency: 'JPY (¥)',  symbol: '¥', currencyCode: 'JPY', currencyName: 'Japanese Yen' },
    { name: 'Jordan',                code: 'JO', dial: '962', currency: 'JOD (JD)', symbol: 'JD', currencyCode: 'JOD', currencyName: 'Jordanian Dinar' },
    { name: 'Kazakhstan',            code: 'KZ', dial: '7',   currency: 'KZT (₸)',  symbol: '₸', currencyCode: 'KZT', currencyName: 'Kazakhstani Tenge' },
    { name: 'Kenya',                 code: 'KE', dial: '254', currency: 'KES (KSh)', symbol: 'KSh', currencyCode: 'KES', currencyName: 'Kenyan Shilling' },
    { name: 'Kuwait',                code: 'KW', dial: '965', currency: 'KWD (KD)', symbol: 'KD', currencyCode: 'KWD', currencyName: 'Kuwaiti Dinar' },
    { name: 'Latvia',                code: 'LV', dial: '371', currency: 'EUR (€)',  symbol: '€', currencyCode: 'EUR', currencyName: 'Euro' },
    { name: 'Lebanon',               code: 'LB', dial: '961', currency: 'LBP (£)',  symbol: '£', currencyCode: 'LBP', currencyName: 'Lebanese Pound' },
    { name: 'Lithuania',             code: 'LT', dial: '370', currency: 'EUR (€)',  symbol: '€', currencyCode: 'EUR', currencyName: 'Euro' },
    { name: 'Luxembourg',            code: 'LU', dial: '352', currency: 'EUR (€)',  symbol: '€', currencyCode: 'EUR', currencyName: 'Euro' },
    { name: 'Malaysia',              code: 'MY', dial: '60',  currency: 'MYR (RM)', symbol: 'RM', currencyCode: 'MYR', currencyName: 'Malaysian Ringgit' },
    { name: 'Maldives',              code: 'MV', dial: '960', currency: 'MVR (Rf)', symbol: 'Rf', currencyCode: 'MVR', currencyName: 'Maldivian Rufiyaa' },
    { name: 'Malta',                 code: 'MT', dial: '356', currency: 'EUR (€)',  symbol: '€', currencyCode: 'EUR', currencyName: 'Euro' },
    { name: 'Mauritius',             code: 'MU', dial: '230', currency: 'MUR (₨)',  symbol: '₨', currencyCode: 'MUR', currencyName: 'Mauritian Rupee' },
    { name: 'Mexico',                code: 'MX', dial: '52',  currency: 'MXN ($)',  symbol: '$', currencyCode: 'MXN', currencyName: 'Mexican Peso' },
    { name: 'Moldova',               code: 'MD', dial: '373', currency: 'MDL (L)',  symbol: 'L', currencyCode: 'MDL', currencyName: 'Moldovan Leu' },
    { name: 'Morocco',               code: 'MA', dial: '212', currency: 'MAD (د.م.)', symbol: 'د.م.', currencyCode: 'MAD', currencyName: 'Moroccan Dirham' },
    { name: 'Mozambique',            code: 'MZ', dial: '258', currency: 'MZN (MT)', symbol: 'MT', currencyCode: 'MZN', currencyName: 'Mozambican Metical' },
    { name: 'Myanmar',               code: 'MM', dial: '95',  currency: 'MMK (K)',  symbol: 'K', currencyCode: 'MMK', currencyName: 'Myanmar Kyat' },
    { name: 'Nepal',                 code: 'NP', dial: '977', currency: 'NPR (₨)',  symbol: '₨', currencyCode: 'NPR', currencyName: 'Nepalese Rupee' },
    { name: 'Netherlands',           code: 'NL', dial: '31',  currency: 'EUR (€)',  symbol: '€', currencyCode: 'EUR', currencyName: 'Euro' },
    { name: 'New Zealand',           code: 'NZ', dial: '64',  currency: 'NZD ($)',  symbol: '$', currencyCode: 'NZD', currencyName: 'New Zealand Dollar' },
    { name: 'Nicaragua',             code: 'NI', dial: '505', currency: 'NIO (C$)', symbol: 'C$', currencyCode: 'NIO', currencyName: 'Nicaraguan Córdoba' },
    { name: 'Nigeria',               code: 'NG', dial: '234', currency: 'NGN (₦)',  symbol: '₦', currencyCode: 'NGN', currencyName: 'Nigerian Naira' },
    { name: 'Norway',                code: 'NO', dial: '47',  currency: 'NOK (kr)', symbol: 'kr', currencyCode: 'NOK', currencyName: 'Norwegian Krone' },
    { name: 'Oman',                  code: 'OM', dial: '968', currency: 'OMR (ر.ع.)', symbol: 'ر.ع.', currencyCode: 'OMR', currencyName: 'Omani Rial' },
    { name: 'Pakistan',              code: 'PK', dial: '92',  currency: 'PKR (₨)',  symbol: '₨', currencyCode: 'PKR', currencyName: 'Pakistani Rupee' },
    { name: 'Panama',                code: 'PA', dial: '507', currency: 'PAB (B/)', symbol: 'B/', currencyCode: 'PAB', currencyName: 'Panamanian Balboa' },
    { name: 'Paraguay',              code: 'PY', dial: '595', currency: 'PYG (₲)',  symbol: '₲', currencyCode: 'PYG', currencyName: 'Paraguayan Guaraní' },
    { name: 'Peru',                  code: 'PE', dial: '51',  currency: 'PEN (S/)', symbol: 'S/', currencyCode: 'PEN', currencyName: 'Peruvian Sol' },
    { name: 'Philippines',           code: 'PH', dial: '63',  currency: 'PHP (₱)',  symbol: '₱', currencyCode: 'PHP', currencyName: 'Philippine Peso' },
    { name: 'Poland',                code: 'PL', dial: '48',  currency: 'PLN (zł)', symbol: 'zł', currencyCode: 'PLN', currencyName: 'Polish Złoty' },
    { name: 'Portugal',              code: 'PT', dial: '351', currency: 'EUR (€)',  symbol: '€', currencyCode: 'EUR', currencyName: 'Euro' },
    { name: 'Qatar',                 code: 'QA', dial: '974', currency: 'QAR (ر.ق)', symbol: 'ر.ق', currencyCode: 'QAR', currencyName: 'Qatari Riyal' },
    { name: 'Romania',               code: 'RO', dial: '40',  currency: 'RON (lei)', symbol: 'lei', currencyCode: 'RON', currencyName: 'Romanian Leu' },
    { name: 'Russia',                code: 'RU', dial: '7',   currency: 'RUB (₽)',  symbol: '₽', currencyCode: 'RUB', currencyName: 'Russian Ruble' },
    { name: 'Rwanda',                code: 'RW', dial: '250', currency: 'RWF (Fr)', symbol: 'Fr', currencyCode: 'RWF', currencyName: 'Rwandan Franc' },
    { name: 'Saudi Arabia',          code: 'SA', dial: '966', currency: 'SAR (ر.س)', symbol: 'ر.س', currencyCode: 'SAR', currencyName: 'Saudi Riyal' },
    { name: 'Senegal',               code: 'SN', dial: '221', currency: 'XOF (CFA)', symbol: 'CFA', currencyCode: 'XOF', currencyName: 'West African CFA Franc' },
    { name: 'Serbia',                code: 'RS', dial: '381', currency: 'RSD (din)', symbol: 'din', currencyCode: 'RSD', currencyName: 'Serbian Dinar' },
    { name: 'Singapore',             code: 'SG', dial: '65',  currency: 'SGD ($)',  symbol: '$', currencyCode: 'SGD', currencyName: 'Singapore Dollar' },
    { name: 'Slovakia',              code: 'SK', dial: '421', currency: 'EUR (€)',  symbol: '€', currencyCode: 'EUR', currencyName: 'Euro' },
    { name: 'Slovenia',              code: 'SI', dial: '386', currency: 'EUR (€)',  symbol: '€', currencyCode: 'EUR', currencyName: 'Euro' },
    { name: 'Somalia',               code: 'SO', dial: '252', currency: 'SOS (Sh)', symbol: 'Sh', currencyCode: 'SOS', currencyName: 'Somali Shilling' },
    { name: 'South Africa',          code: 'ZA', dial: '27',  currency: 'ZAR (R)',  symbol: 'R', currencyCode: 'ZAR', currencyName: 'South African Rand' },
    { name: 'South Korea',           code: 'KR', dial: '82',  currency: 'KRW (₩)',  symbol: '₩', currencyCode: 'KRW', currencyName: 'South Korean Won' },
    { name: 'Spain',                 code: 'ES', dial: '34',  currency: 'EUR (€)',  symbol: '€', currencyCode: 'EUR', currencyName: 'Euro' },
    { name: 'Sri Lanka',             code: 'LK', dial: '94',  currency: 'LKR (₨)',  symbol: '₨', currencyCode: 'LKR', currencyName: 'Sri Lankan Rupee' },
    { name: 'Sudan',                 code: 'SD', dial: '249', currency: 'SDG (£)',  symbol: '£', currencyCode: 'SDG', currencyName: 'Sudanese Pound' },
    { name: 'Sweden',                code: 'SE', dial: '46',  currency: 'SEK (kr)', symbol: 'kr', currencyCode: 'SEK', currencyName: 'Swedish Krona' },
    { name: 'Switzerland',           code: 'CH', dial: '41',  currency: 'CHF (Fr)', symbol: 'Fr', currencyCode: 'CHF', currencyName: 'Swiss Franc' },
    { name: 'Syria',                 code: 'SY', dial: '963', currency: 'SYP (£S)', symbol: '£S', currencyCode: 'SYP', currencyName: 'Syrian Pound' },
    { name: 'Taiwan',                code: 'TW', dial: '886', currency: 'TWD ($)',  symbol: '$', currencyCode: 'TWD', currencyName: 'New Taiwan Dollar' },
    { name: 'Tanzania',              code: 'TZ', dial: '255', currency: 'TZS (Sh)', symbol: 'Sh', currencyCode: 'TZS', currencyName: 'Tanzanian Shilling' },
    { name: 'Thailand',              code: 'TH', dial: '66',  currency: 'THB (฿)',  symbol: '฿', currencyCode: 'THB', currencyName: 'Thai Baht' },
    { name: 'Trinidad & Tobago',     code: 'TT', dial: '1',   currency: 'TTD ($)',  symbol: '$', currencyCode: 'TTD', currencyName: 'Trinidad & Tobago Dollar' },
    { name: 'Tunisia',               code: 'TN', dial: '216', currency: 'TND (DT)', symbol: 'DT', currencyCode: 'TND', currencyName: 'Tunisian Dinar' },
    { name: 'Turkey',                code: 'TR', dial: '90',  currency: 'TRY (₺)',  symbol: '₺', currencyCode: 'TRY', currencyName: 'Turkish Lira' },
    { name: 'Uganda',                code: 'UG', dial: '256', currency: 'UGX (Sh)', symbol: 'Sh', currencyCode: 'UGX', currencyName: 'Ugandan Shilling' },
    { name: 'Ukraine',               code: 'UA', dial: '380', currency: 'UAH (₴)',  symbol: '₴', currencyCode: 'UAH', currencyName: 'Ukrainian Hryvnia' },
    { name: 'United Arab Emirates',  code: 'AE', dial: '971', currency: 'AED (د.إ)', symbol: 'د.إ', currencyCode: 'AED', currencyName: 'UAE Dirham' },
    { name: 'United Kingdom',        code: 'GB', dial: '44',  currency: 'GBP (£)',  symbol: '£', currencyCode: 'GBP', currencyName: 'British Pound' },
    { name: 'United States',         code: 'US', dial: '1',   currency: 'USD ($)',  symbol: '$', currencyCode: 'USD', currencyName: 'US Dollar' },
    { name: 'Uruguay',               code: 'UY', dial: '598', currency: 'UYU ($)',  symbol: '$', currencyCode: 'UYU', currencyName: 'Uruguayan Peso' },
    { name: 'Uzbekistan',            code: 'UZ', dial: '998', currency: 'UZS (сум)', symbol: 'сум', currencyCode: 'UZS', currencyName: 'Uzbekistani Sum' },
    { name: 'Venezuela',             code: 'VE', dial: '58',  currency: 'VES (Bs.)', symbol: 'Bs.', currencyCode: 'VES', currencyName: 'Venezuelan Bolívar' },
    { name: 'Vietnam',               code: 'VN', dial: '84',  currency: 'VND (₫)',  symbol: '₫', currencyCode: 'VND', currencyName: 'Vietnamese Dong' },
    { name: 'Yemen',                 code: 'YE', dial: '967', currency: 'YER (﷼)', symbol: '﷼', currencyCode: 'YER', currencyName: 'Yemeni Rial' },
    { name: 'Zambia',                code: 'ZM', dial: '260', currency: 'ZMW (ZK)', symbol: 'ZK', currencyCode: 'ZMW', currencyName: 'Zambian Kwacha' },
    { name: 'Zimbabwe',              code: 'ZW', dial: '263', currency: 'ZWL ($)',  symbol: '$', currencyCode: 'ZWL', currencyName: 'Zimbabwean Dollar' },
  ];

  /* ---------- Lookup helpers ---------- */
  /** Returns the RS_COUNTRIES entry for a given country name (case-insensitive). */
  window.RS_getCountryByName = function(name) {
    const n = String(name || '').trim().toLowerCase();
    return window.RS_COUNTRIES.find(c => c.name.toLowerCase() === n) || null;
  };

  /** Returns standard default tax label and rate for a given country (case-insensitive). */
  window.RS_getCountryTaxInfo = function(name) {
    const n = String(name || '').trim().toLowerCase();
    if (['india'].includes(n)) return { label: 'GST', rate: 5 };
    if (['united kingdom', 'uk', 'great britain'].includes(n)) return { label: 'VAT', rate: 20 };
    if (['saudi arabia'].includes(n)) return { label: 'VAT', rate: 15 };
    if (['united arab emirates', 'uae'].includes(n)) return { label: 'VAT', rate: 5 };
    if (['australia'].includes(n)) return { label: 'GST', rate: 10 };
    if (['new zealand'].includes(n)) return { label: 'GST', rate: 15 };
    if (['singapore'].includes(n)) return { label: 'GST', rate: 9 };
    if (['canada'].includes(n)) return { label: 'GST', rate: 5 };
    if (['united states', 'us', 'usa'].includes(n)) return { label: 'Sales Tax', rate: 8 };
    if (['ireland'].includes(n)) return { label: 'VAT', rate: 23 };
    if (['germany', 'austria', 'belgium', 'france', 'italy', 'spain', 'netherlands', 'portugal', 'finland', 'greece'].includes(n)) return { label: 'VAT', rate: 20 };
    if (['south africa'].includes(n)) return { label: 'VAT', rate: 15 };
    
    // Fallback: Check currency to guess VAT vs Sales Tax
    const entry = window.RS_getCountryByName && window.RS_getCountryByName(name);
    if (entry) {
      if (entry.currencyCode === 'EUR') return { label: 'VAT', rate: 20 };
      if (entry.currencyCode === 'GBP') return { label: 'VAT', rate: 20 };
    }
    return { label: 'VAT', rate: 10 }; // general default
  };

  /** Returns dynamic tax rate slabs for a given country (case-insensitive). */
  window.RS_getCountryTaxSlabs = function(name) {
    const n = String(name || '').trim().toLowerCase();
    if (['india'].includes(n)) return ['0%', '5%', '12%', '18%', '28%'];
    if (['united kingdom', 'uk', 'great britain'].includes(n)) return ['0%', '5%', '20%'];
    if (['ireland'].includes(n)) return ['0%', '13.5%', '23%'];
    if (['saudi arabia'].includes(n)) return ['0%', '15%'];
    if (['united arab emirates', 'uae'].includes(n)) return ['0%', '5%'];
    if (['australia'].includes(n)) return ['0%', '10%'];
    if (['singapore'].includes(n)) return ['0%', '9%'];
    if (['canada'].includes(n)) return ['0%', '5%'];
    // Default fallback
    return ['0%', '10%', '20%'];
  };

  /** Returns typical VAT rate slab for Ireland based on item name and category. */
  window.RS_getIrelandTypicalTaxSlab = function(itemName, categoryName) {
    const name = String(itemName || '').toLowerCase().trim();
    const cat = String(categoryName || '').toLowerCase().trim();

    // Alcohol: 23%
    if (name.includes('beer') || name.includes('wine') || name.includes('whiskey') || name.includes('whisky') || 
        name.includes('vodka') || name.includes('rum') || name.includes('gin') || name.includes('cider') || 
        name.includes('alcohol') || name.includes('cocktail') || name.includes('liqueur') || name.includes('brandy') ||
        name.includes('tequila') || name.includes('champagne') || name.includes('prosecco') ||
        cat.includes('alcohol') || cat.includes('bar') || cat.includes('wine') || cat.includes('beer') || 
        cat.includes('cocktail') || cat.includes('spirit') || cat.includes('liquor')) {
      return '23%';
    }

    // Soft drinks, energy drinks, sweets, confectionery: 23%
    if (name.includes('cola') || name.includes('soda') || name.includes('soft drink') || name.includes('energy drink') || 
        name.includes('sprite') || name.includes('fanta') || name.includes('coke') || name.includes('pepsi') || 
        name.includes('lemonade') || name.includes('sweet') || name.includes('chocolate') || name.includes('candy') || 
        name.includes('confectionery') || name.includes('cookie') || name.includes('brownie') || name.includes('cake') ||
        name.includes('muffin') || name.includes('pastry') || name.includes('donut') || name.includes('lollipop') || 
        name.includes('ice cream') || name.includes('milkshake') || name.includes('shake') ||
        cat.includes('beverage') || cat.includes('soft drink') || cat.includes('sweet') || 
        cat.includes('dessert') || cat.includes('shake') || cat.includes('juice')) {
      return '23%';
    }

    // Hot takeaway food (burgers, pizza, curry, chips, etc.): 13.5%
    if (name.includes('burger') || name.includes('pizza') || name.includes('curry') || name.includes('chips') || 
        name.includes('fries') || name.includes('hot') || name.includes('kebab') || name.includes('tikka') || 
        name.includes('biryani') || name.includes('naan') || name.includes('grilled') || name.includes('pasta') || 
        name.includes('soup') || name.includes('coffee') || name.includes('tea') || name.includes('steak') || 
        name.includes('fried') || name.includes('noodle') || name.includes('rice') || name.includes('masala') ||
        name.includes('korma') || name.includes('tandoori') || name.includes('samosa') || name.includes('wrap') ||
        name.includes('sandwich') || name.includes('panini') || name.includes('bagel') || name.includes('toast') ||
        cat.includes('starter') || cat.includes('main') || cat.includes('bread') || cat.includes('pizza') || 
        cat.includes('burger') || cat.includes('pasta') || cat.includes('rice') || cat.includes('biryani') || 
        cat.includes('wrap') || cat.includes('hot food') || cat.includes('takeaway')) {
      return '13.5%';
    }

    // Basic unprepared food items: 0%
    if (name.includes('raw') || name.includes('unprepared') || name.includes('vegetable') || name.includes('fruit') ||
        name.includes('egg') || name.includes('milk') || name.includes('bread') || name.includes('flour') ||
        name.includes('wheat') || name.includes('rice') || name.includes('butter') || name.includes('cheese')) {
      return '0%';
    }

    // Default basic fallback
    return '0%';
  };

  /** Returns the RS_COUNTRIES entry for a given dial code (e.g. "353"). */
  window.RS_getCountryByDial = function(dial) {
    const d = String(dial || '').replace(/\D/g, '');
    return window.RS_COUNTRIES.find(c => c.dial === d) || null;
  };

  /** Converts a 2-letter ISO country code to its flag emoji. E.g. 'IE' → '🇮🇪' */
  window.RS_countryFlag = function(code) {
    if (!code || code.length !== 2) return '🌐';
    return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
  };

  /**
   * Builds and mounts a reusable phone-prefix picker next to a plain <input>.
   * @param {HTMLInputElement} phoneInput  - the target phone <input> element
   * @param {string} [defaultCode]         - ISO-2 code to pre-select (e.g. 'IN')
   * @param {Function} [onChange]          - optional callback(entry) when prefix changes
   * Returns the wrapper <div> that replaces the raw input in the DOM.
   */
  window.RS_buildPhonePrefix = function(phoneInput, defaultCode, onChange) {
    if (!phoneInput || phoneInput.dataset.phonePrefixBuilt) return;
    phoneInput.dataset.phonePrefixBuilt = '1';

    // Determine starting country
    const startCode = defaultCode || 'IN';
    let activeEntry = window.RS_COUNTRIES.find(c => c.code === startCode) ||
                      window.RS_COUNTRIES.find(c => c.name === 'India');

    // Build wrapper
    const wrap = document.createElement('div');
    wrap.className = 'phone-combo';
    wrap.style.cssText = 'display:flex;align-items:center;position:relative;border:1px solid var(--stroke-2);border-radius:8px;background:var(--glass);overflow:visible;height:34px;box-sizing:border-box;transition:var(--t);';

    // Flag button
    const flagBtn = document.createElement('button');
    flagBtn.type = 'button';
    flagBtn.className = 'phone-flag-btn';
    flagBtn.style.cssText = 'height:100%;flex-shrink:0;display:flex;align-items:center;gap:4px;padding:0 8px 0 10px;background:transparent;border:none;border-right:1px solid var(--stroke-2);cursor:pointer;font-size:12.5px;font-weight:600;color:var(--text);white-space:nowrap;border-top-left-radius:8px;border-bottom-left-radius:8px;';
    flagBtn.innerHTML = `<span class="pflag">${window.RS_countryFlag(activeEntry.code)}</span><span class="pdial">+${activeEntry.dial}</span><i class="fa-solid fa-chevron-down" style="font-size:9px;opacity:0.6;margin-left:2px;"></i>`;

    // Picker dropdown
    const picker = document.createElement('div');
    picker.className = 'phone-country-picker';
    picker.style.cssText = 'position:absolute;top:calc(100% + 4px);left:0;z-index:9999;background:var(--panel-solid,var(--panel));border:1px solid var(--stroke-2);border-radius:var(--r-md);box-shadow:0 8px 32px rgba(0,0,0,0.22);min-width:260px;max-height:260px;display:none;flex-direction:column;overflow:hidden;';

    // Search inside picker
    const srch = document.createElement('input');
    srch.type = 'text';
    srch.placeholder = 'Search country or code…';
    srch.style.cssText = 'padding:9px 12px;border:none;border-bottom:1px solid var(--stroke-2);background:var(--glass);color:var(--text);font-size:13px;outline:none;font-family:inherit;flex-shrink:0;';

    const list = document.createElement('div');
    list.style.cssText = 'overflow-y:auto;flex:1;';

    const renderList = (q) => {
      list.innerHTML = '';
      const f = (q || '').toLowerCase();
      window.RS_COUNTRIES.filter(c =>
        !f || c.name.toLowerCase().includes(f) || c.dial.includes(f) || c.code.toLowerCase().includes(f)
      ).slice(0, 80).forEach(c => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;font-size:13px;transition:background .12s;';
        if (c.code === activeEntry.code) item.style.background = 'var(--orange-tint,rgba(249,115,22,0.08))';
        item.innerHTML = `<span style="font-size:18px;width:22px;text-align:center;">${window.RS_countryFlag(c.code)}</span><span style="flex:1;color:var(--text);">${c.name}</span><span style="color:var(--text-soft);font-weight:600;">+${c.dial}</span>`;
        item.addEventListener('mousedown', e => {
          e.preventDefault();
          activeEntry = c;
          flagBtn.querySelector('.pflag').textContent = window.RS_countryFlag(c.code);
          flagBtn.querySelector('.pdial').textContent = `+${c.dial}`;
          picker.style.display = 'none';
          // Strip any old prefix from the input and add the new one
          let raw = phoneInput.value.replace(/^\+\d{1,4}\s*/, '').trim();
          phoneInput.value = `+${c.dial} ${raw}`;
          phoneInput.focus();
          phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof onChange === 'function') onChange(c);
        });
        item.addEventListener('mouseenter', () => item.style.background = 'var(--glass-2,rgba(255,255,255,0.06))');
        item.addEventListener('mouseleave', () => item.style.background = c.code === activeEntry.code ? 'var(--orange-tint,rgba(249,115,22,0.08))' : '');
        list.appendChild(item);
      });
    };

    srch.addEventListener('input', () => renderList(srch.value));
    picker.appendChild(srch);
    picker.appendChild(list);

    let open = false;
    flagBtn.addEventListener('click', e => {
      e.stopPropagation();
      open = !open;
      picker.style.display = open ? 'flex' : 'none';
      if (open) { renderList(''); setTimeout(() => srch.focus(), 50); }
    });
    document.addEventListener('click', () => { open = false; picker.style.display = 'none'; }, true);
    picker.addEventListener('click', e => e.stopPropagation());

    // Style the input itself
    phoneInput.style.cssText = 'flex:1;border:none;background:transparent;padding:0 10px;font-size:12.5px;color:var(--text);outline:none;font-family:inherit;min-width:0;height:100%;box-sizing:border-box;';

    // Auto-detect and sync flag from input value when typing or programmatically changed
    const syncFlagFromValue = () => {
      const val = phoneInput.value.trim();
      if (!val || !val.startsWith('+')) return;
      const cleanVal = val.replace(/\D/g, '');
      const sorted = window.RS_COUNTRIES.slice().sort((a, b) => b.dial.length - a.dial.length);
      const matchedCountry = sorted.find(c => cleanVal.startsWith(c.dial));
      if (matchedCountry && matchedCountry.code !== activeEntry.code) {
        activeEntry = matchedCountry;
        flagBtn.querySelector('.pflag').textContent = window.RS_countryFlag(matchedCountry.code);
        flagBtn.querySelector('.pdial').textContent = `+${matchedCountry.dial}`;
      }
    };
    phoneInput.addEventListener('input', syncFlagFromValue);
    phoneInput.RS_setCountryCode = function(code) {
      const entry = window.RS_COUNTRIES.find(c => c.code === code);
      if (entry) {
        activeEntry = entry;
        flagBtn.querySelector('.pflag').textContent = window.RS_countryFlag ? window.RS_countryFlag(entry.code) : '';
        flagBtn.querySelector('.pdial').textContent = `+${entry.dial}`;
      }
    };

    // Replace input in DOM with wrapper
    phoneInput.parentNode.insertBefore(wrap, phoneInput);
    wrap.appendChild(flagBtn);
    wrap.appendChild(phoneInput);
    wrap.appendChild(picker);

    return wrap;
  };

  /** Returns unique currencies list as [{ currency, symbol, currencyCode }] */
  window.RS_getCurrencies = function() {
    const seen = new Set();
    return window.RS_COUNTRIES
      .filter(c => { if (seen.has(c.currency)) return false; seen.add(c.currency); return true; })
      .map(c => ({ currency: c.currency, symbol: c.symbol, currencyCode: c.currencyCode, currencyName: c.currencyName }))
      .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));
  };

  /**
   * Creates a premium custom dropdown widget that wraps a native <select> element.
   * The native <select> remains hidden but keeps its value in sync — so all existing
   * form listeners (collect, onchange, etc.) continue working with zero changes.
   *
   * Usage:  RS_createCustomDropdown(selectElement)
   *   – OR –  RS_createCustomDropdown(selectElement, { searchable: true })
   */
  window.RS_createCustomDropdown = function(nativeSel, opts) {
    if (!nativeSel || nativeSel.dataset.cdWrapped) return; // already wrapped
    nativeSel.dataset.cdWrapped = '1';
    nativeSel.style.display = 'none';

    const options = opts || {};
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-dropdown-widget';
    wrapper.style.width = '100%';

    // Build option list from native select
    const buildItems = () => {
      const items = [];
      for (const opt of nativeSel.options) {
        items.push({ value: opt.value || opt.text, label: opt.text });
      }
      return items;
    };

    const currentLabel = () => {
      const sel = nativeSel.options[nativeSel.selectedIndex];
      return sel ? (sel.text || sel.value) : '';
    };

    // Trigger button
    const trigger = document.createElement('div');
    trigger.className = 'dropdown-trigger';
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('tabindex', '0');

    const labelSpan = document.createElement('span');
    labelSpan.className = 'dropdown-trigger-label';
    labelSpan.textContent = currentLabel();

    const caret = document.createElement('i');
    caret.className = 'fa-solid fa-chevron-down caret';

    trigger.appendChild(labelSpan);
    trigger.appendChild(caret);

    // Dropdown panel
    const menu = document.createElement('ul');
    menu.className = 'dropdown-menu';
    menu.setAttribute('role', 'listbox');

    const renderMenuItems = (filter) => {
      menu.innerHTML = '';
      const items = buildItems();
      const q = (filter || '').toLowerCase();
      let shown = 0;
      items.forEach(item => {
        if (q && !item.label.toLowerCase().includes(q)) return;
        const li = document.createElement('li');
        li.className = 'dropdown-item' + (item.value === nativeSel.value || item.label === currentLabel() ? ' active' : '');
        li.setAttribute('role', 'option');
        li.setAttribute('data-val', item.value);
        li.textContent = item.label;
        li.addEventListener('mousedown', (e) => {
          e.preventDefault();
          nativeSel.value = item.value;
          // If value not set (option text = value), find by text
          if (nativeSel.value !== item.value) {
            for (let i = 0; i < nativeSel.options.length; i++) {
              if (nativeSel.options[i].text === item.label) {
                nativeSel.selectedIndex = i;
                break;
              }
            }
          }
          labelSpan.textContent = item.label;
          nativeSel.dispatchEvent(new Event('change', { bubbles: true }));
          closeMenu();
        });
        menu.appendChild(li);
        shown++;
      });
      if (shown === 0) {
        const li = document.createElement('li');
        li.className = 'dropdown-item';
        li.style.color = 'var(--text-mute)';
        li.style.fontStyle = 'italic';
        li.textContent = 'No results';
        menu.appendChild(li);
      }
    };

    // Search input (optional)
    let searchInput = null;
    if (options.searchable) {
      const searchWrap = document.createElement('div');
      searchWrap.style.cssText = 'padding:6px 8px 2px;';
      searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = 'Search…';
      searchInput.style.cssText = 'width:100%;padding:7px 10px;border:1px solid var(--stroke-2);border-radius:var(--r-xs);background:var(--glass);color:var(--text);font-size:13px;outline:none;font-family:inherit;';
      searchInput.addEventListener('input', () => renderMenuItems(searchInput.value));
      searchInput.addEventListener('focus', () => { searchInput.style.borderColor = 'var(--orange)'; });
      searchInput.addEventListener('blur',  () => { searchInput.style.borderColor = 'var(--stroke-2)'; });
      searchWrap.appendChild(searchInput);
      menu.appendChild(searchWrap);
    }

    const openMenu = () => {
      // Close all other open dropdowns
      document.querySelectorAll('.custom-dropdown-widget.active').forEach(d => {
        if (d !== wrapper) d.classList.remove('active');
      });
      if (searchInput) { searchInput.value = ''; }
      renderMenuItems('');
      wrapper.classList.add('active');
      if (searchInput) setTimeout(() => searchInput.focus(), 60);
      // Ensure menu opens upward if near bottom of viewport
      setTimeout(() => {
        const rect = menu.getBoundingClientRect();
        if (rect.bottom > window.innerHeight - 20) {
          menu.style.top = 'auto';
          menu.style.bottom = 'calc(100% + 6px)';
        } else {
          menu.style.top = 'calc(100% + 6px)';
          menu.style.bottom = 'auto';
        }
      }, 0);
    };

    const closeMenu = () => {
      wrapper.classList.remove('active');
      if (searchInput) searchInput.value = '';
    };

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (wrapper.classList.contains('active')) closeMenu(); else openMenu();
    });

    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMenu(); }
      if (e.key === 'Escape') closeMenu();
    });

    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) closeMenu();
    }, true);

    // Keep widget label in sync if native value is changed programmatically
    const syncLabel = () => { labelSpan.textContent = currentLabel(); };
    nativeSel.addEventListener('change', syncLabel);

    // Observe if options change (e.g. dynamic population)
    const mo = new MutationObserver(syncLabel);
    mo.observe(nativeSel, { childList: true, subtree: true });

    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);
    nativeSel.parentNode.insertBefore(wrapper, nativeSel.nextSibling);
  };

  /**
   * Wraps all select.form-input elements inside a given container that are not
   * already wrapped.  Call after dynamic HTML is injected into the DOM.
   *
   * Usage: RS_wrapAllSelects(document.getElementById('set-body'))
   *
   * Pass `true` as second arg to make country/currency selects searchable.
   */
  window.RS_wrapAllSelects = function(container, searchableIds) {
    const root = container || document;
    const ids = new Set(Array.isArray(searchableIds) ? searchableIds : []);
    root.querySelectorAll('select.form-input:not([data-cd-wrapped])').forEach(sel => {
      const isSearchable = ids.has(sel.id) || ids.has(sel.dataset.skey);
      window.RS_createCustomDropdown(sel, { searchable: isSearchable });
    });
  };

  /**
   * Helper to reconstruct a full, unified phone number (including dial code)
   * from a phone input element that might have a country picker wrapper.
   */
  window.RS_getFullPhoneNumber = function(phoneInput) {
    if (!phoneInput) return '';
    let val = phoneInput.value.trim();
    if (!val) return '';

    // If it already starts with '+', it is already a full international number
    if (val.startsWith('+')) {
      return val;
    }

    // Otherwise, try to find a sibling flag button inside the .phone-combo wrapper
    const combo = phoneInput.closest('.phone-combo');
    const dialEl = combo ? combo.querySelector('.pdial') : null;
    if (dialEl) {
      const dialCode = dialEl.textContent.trim(); // E.g., "+353" or "+91"
      const dialDigits = dialCode.replace(/\D/g, ''); // E.g., "353" or "91"
      
      const cleanVal = val.replace(/\D/g, '');
      if (cleanVal.startsWith(dialDigits)) {
        // User typed the dial code but omitted the '+' (e.g., "353852258004")
        return '+' + val;
      } else {
        // They typed only the national/local number, prepend the dial code
        return dialCode + ' ' + val;
      }
    }

    return val;
  };

})();
