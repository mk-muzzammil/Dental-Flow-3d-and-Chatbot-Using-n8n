/** Demo clinic content and 3D appearance. Live clinic data is edited in Admin → Clinic management. */
import type { Lang } from '@/lib/i18n';
import type { ToothLook } from '@/components/three/look';

type T = Record<Lang, string>;

export type Service = { id: string; name: T; minutes: number; price: number; blurb: T };
export type Dentist = { id: string; name: string; specialty: T; days: T; initials: string; weeklyHours?: { day: string; open: string; close: string; breaks?: [string,string][] }[] };

export const clinic = {
  timezone: 'Asia/Karachi',
  name: { en: 'Smile Dental Clinic', ur: 'سمائل ڈینٹل کلینک', ar: 'عيادة سمايل لطب الأسنان' } as T,
  city: { en: 'Lahore', ur: 'لاہور', ar: 'لاهور' } as T,
  phone: '+923197010562',
  email: 'hello@example.com',
  address: { en: '12 Main Boulevard, Lahore', ur: '12 مین بلیوارڈ، لاہور', ar: '12 مين بوليفارد، لاهور' } as T,
  mapUrl: 'https://maps.google.com/?q=12+Main+Boulevard+Lahore',
  currency: 'PKR',
  hours: [
    { day: { en: 'Monday to Thursday', ur: 'پیر تا جمعرات', ar: 'الاثنين إلى الخميس' } as T, time: '10:00 AM – 8:00 PM' },
    { day: { en: 'Friday', ur: 'جمعہ', ar: 'الجمعة' } as T, time: '10:00 AM – 8:00 PM' },
    { day: { en: 'Saturday', ur: 'ہفتہ', ar: 'السبت' } as T, time: '' },
    { day: { en: 'Sunday', ur: 'اتوار', ar: 'الأحد' } as T, time: '' },
  ],
};

/**
 * The 3D tooth on the page. To use another model:
 *   1. try it first on the Model Lab page: http://localhost:3000/en/model-lab
 *   2. copy the .glb file into website/public/models/
 *   3. paste the settings the Model Lab gives you here.
 */
export const tooth3d: ToothLook = {
  file: '/models/molar.glb',   // the built-in molar
  finish: 'clinic',            // 'clinic' (white enamel), 'own' (the model's own colours) or 'glass'
  rotation: [0, 0, 0],         // degrees around X, Y, Z, if a model arrives lying down
  scale: 1,
  credit: '',                  // e.g. 'Tooth model by NAME, CC BY 4.0'
};

export const services: Service[] = [
  { id: 'checkup', minutes: 30, price: 1500,
    name: { en: 'Check-up & Consultation', ur: 'چیک اپ اور مشورہ', ar: 'فحص واستشارة' },
    blurb: { en: 'A full examination, and a clear plan if anything needs attention.', ur: 'مکمل معائنہ، اور اگر کسی علاج کی ضرورت ہو تو واضح منصوبہ۔', ar: 'فحص شامل، وخطة واضحة إذا احتاج شيء إلى علاج.' } },
  { id: 'cleaning', minutes: 60, price: 4000,
    name: { en: 'Scaling & Polishing', ur: 'سکیلنگ اور پالش', ar: 'تنظيف وتلميع الأسنان' },
    blurb: { en: 'Removes the build-up that brushing cannot reach.', ur: 'وہ میل صاف کرتی ہے جو برش سے نہیں نکلتا۔', ar: 'إزالة الترسبات التي لا تصل إليها الفرشاة.' } },
  { id: 'filling', minutes: 60, price: 5000,
    name: { en: 'Cavity Filling', ur: 'کیویٹی فلنگ', ar: 'حشو الأسنان' },
    blurb: { en: 'Tooth-coloured materials, matched to your tooth.', ur: 'دانت کے رنگ کا میٹیریل، آپ کے دانت سے ملتا ہوا۔', ar: 'مواد بلون الأسنان تتطابق مع سنّك.' } },
  { id: 'rct', minutes: 90, price: 18000,
    name: { en: 'Root Canal Treatment', ur: 'روٹ کینال ٹریٹمنٹ', ar: 'علاج عصب الأسنان' },
    blurb: { en: 'By a specialist who explains every step first.', ur: 'اسپیشلسٹ کے ہاتھوں، جو ہر مرحلہ پہلے سمجھاتے ہیں۔', ar: 'على يد أخصائي يشرح كل خطوة قبل البدء.' } },
  { id: 'extract', minutes: 60, price: 6000,
    name: { en: 'Tooth Extraction', ur: 'دانت نکلوانا', ar: 'خلع الأسنان' },
    blurb: { en: 'Gentle, careful and properly numbed.', ur: 'نرمی اور احتیاط کے ساتھ، مکمل سُن کر کے۔', ar: 'بلطف وعناية، وبتخدير كامل.' } },
  { id: 'whiten', minutes: 60, price: 15000,
    name: { en: 'Teeth Whitening', ur: 'دانت سفید کرنا', ar: 'تبييض الأسنان' },
    blurb: { en: 'A brighter smile in one visit, under supervision.', ur: 'ایک ہی وزٹ میں روشن مسکراہٹ، ماہر کی نگرانی میں۔', ar: 'ابتسامة أكثر إشراقاً في زيارة واحدة، تحت الإشراف.' } },
];

/** The clinic's dentists. Keep this list the same as the Doctors tab of the sheet: the page shows this
 *  list, but the chat books from the sheet, so a dentist missing from the sheet cannot be booked. */
export const dentists: Dentist[] = [
  { id: 'dr-ayesha', name: 'Dr. Ayesha Khan', initials: 'AK',
    specialty: { en: 'General dentistry · Orthodontics', ur: 'جنرل ڈینٹسٹری · آرتھوڈانٹکس', ar: 'طب الأسنان العام · تقويم الأسنان' },
    weeklyHours: ['Monday','Tuesday','Wednesday','Thursday','Friday'].map(day => ({day,open:'10:00',close:'16:00'})),
    days: { en: 'Monday to Friday', ur: 'پیر تا جمعہ', ar: 'الاثنين إلى الجمعة' } },
  { id: 'dr-bilal', name: 'Dr. Bilal Ahmed', initials: 'BA',
    specialty: { en: 'Root canal specialist', ur: 'روٹ کینال اسپیشلسٹ', ar: 'أخصائي علاج العصب والجذور' },
    weeklyHours: ['Monday','Tuesday','Wednesday','Thursday','Friday'].map(day => ({day,open:'15:00',close:'20:00'})),
    days: { en: 'Monday to Friday', ur: 'پیر تا جمعہ', ar: 'الاثنين إلى الجمعة' } },
];

/** Patient education reviewed against NHS dental check-up and treatment guidance. */
export const faq: { q: T; a: T }[] = [
  { q: { en: 'How often should I have a dental check-up?', ur: 'دانتوں کا چیک اپ کتنے عرصے بعد کروانا چاہیے؟', ar: 'كم مرة أحتاج إلى فحص الأسنان؟' },
    a: { en: 'The right interval depends on your oral health and your risk of tooth decay or gum disease. Your dentist will recommend a schedule after examining your teeth and gums. If a new problem develops, arrange an appointment rather than waiting for your next routine check-up.',
      ur: 'چیک اپ کا وقفہ آپ کے دانتوں اور مسوڑھوں کی صحت اور بیماری کے خطرے پر منحصر ہے۔ معائنے کے بعد ڈاکٹر مناسب وقفہ تجویز کریں گے۔ کوئی نئی تکلیف ہو تو اگلے معمول کے چیک اپ کا انتظار کرنے کے بجائے اپائنٹمنٹ لیں۔',
      ar: 'يعتمد موعد الفحص التالي على صحة فمك واحتمال الإصابة بالتسوس أو أمراض اللثة. يحدد طبيب الأسنان الفترة المناسبة بعد فحص الأسنان واللثة. إذا ظهرت مشكلة جديدة، احجز موعداً ولا تنتظر الفحص الدوري التالي.' } },
  { q: { en: 'What happens during a dental consultation?', ur: 'دانتوں کے ابتدائی معائنے میں کیا ہوتا ہے؟', ar: 'ماذا يحدث خلال استشارة طبيب الأسنان؟' },
    a: { en: 'A consultation includes a discussion of your concerns and medical history, followed by an examination of your teeth, gums and mouth. The dentist can explain any findings, discuss suitable treatment options and advise you on caring for your teeth at home.',
      ur: 'مشورے کے دوران آپ کی تکلیف اور طبی تاریخ کے بارے میں پوچھا جاتا ہے، پھر دانتوں، مسوڑھوں اور منہ کا معائنہ کیا جاتا ہے۔ ڈاکٹر معائنے کے نتائج، مناسب علاج کے طریقے اور گھر پر دانتوں کی دیکھ بھال کے بارے میں رہنمائی کر سکتے ہیں۔',
      ar: 'تشمل الاستشارة مناقشة ما يزعجك وتاريخك الصحي، ثم فحص الأسنان واللثة والفم. يشرح الطبيب نتائج الفحص وخيارات العلاج المناسبة، ويقدم إرشادات للعناية بالأسنان في المنزل.' } },
  { q: { en: 'What is scaling and polishing?', ur: 'سکیلنگ اور پالش کیا ہے؟', ar: 'ما المقصود بتنظيف وتلميع الأسنان؟' },
    a: { en: 'Scaling removes plaque and hardened tartar from the teeth. Polishing helps remove surface stains. Your dentist will assess whether you need professional cleaning or further gum treatment; regular brushing and cleaning between teeth remain essential afterwards.',
      ur: 'سکیلنگ سے دانتوں پر جمی پلاک اور سخت میل صاف کی جاتی ہے، جبکہ پالش سطحی داغ کم کرنے میں مدد دیتی ہے۔ ڈاکٹر معائنے کے بعد بتائیں گے کہ صفائی کافی ہے یا مسوڑھوں کے مزید علاج کی ضرورت ہے۔ اس کے بعد بھی باقاعدہ برش اور دانتوں کے درمیان صفائی ضروری ہے۔',
      ar: 'يزيل تنظيف الأسنان طبقة البلاك والجير المتصلب، ويساعد التلميع على إزالة التصبغات السطحية. يقيّم الطبيب حاجتك إلى التنظيف المهني أو علاج إضافي للثة. وتبقى العناية اليومية بالفرشاة والتنظيف بين الأسنان ضرورية بعد ذلك.' } },
  { q: { en: 'When is root canal treatment needed?', ur: 'روٹ کینال کی ضرورت کب ہوتی ہے؟', ar: 'متى أحتاج إلى علاج عصب الأسنان؟' },
    a: { en: 'Root canal treatment may be needed when the soft tissue inside a tooth becomes infected. The dentist removes the infected tissue, cleans the canals and seals the tooth to help preserve it. Local anaesthetic is usually used, and a crown may be recommended afterwards depending on the condition of the tooth.',
      ur: 'جب دانت کے اندر موجود نرم بافت میں انفیکشن ہو جائے تو روٹ کینال کی ضرورت پڑ سکتی ہے۔ ڈاکٹر متاثرہ بافت نکال کر جڑ کی نالیوں کو صاف اور بند کرتے ہیں تاکہ دانت بچایا جا سکے۔ عموماً مقامی بے حسی کی دوا استعمال ہوتی ہے، اور دانت کی حالت کے مطابق بعد میں کراؤن لگانے کا مشورہ دیا جا سکتا ہے۔',
      ar: 'قد يلزم علاج العصب عندما تصاب الأنسجة اللينة داخل السن بالعدوى. يزيل الطبيب الأنسجة المصابة وينظف قنوات الجذور ثم يغلق السن للمساعدة على الحفاظ عليه. يُستخدم عادةً التخدير الموضعي، وقد يُنصح بتركيب تاج لاحقاً بحسب حالة السن.' } },
  { q: { en: 'Is professional teeth whitening suitable for everyone?', ur: 'کیا دانت سفید کروانا ہر کسی کے لیے مناسب ہے؟', ar: 'هل تبييض الأسنان مناسب للجميع؟' },
    a: { en: 'A dentist should check that your teeth and gums are healthy before recommending whitening. Whitening changes the colour of natural teeth, but does not lighten crowns or implants. Results vary, and temporary tooth sensitivity or gum irritation can occur. Discuss your dental history and expectations during your consultation.',
      ur: 'دانت سفید کرنے سے پہلے ڈاکٹر کو دانتوں اور مسوڑھوں کی صحت کا معائنہ کرنا چاہیے۔ یہ علاج قدرتی دانتوں کا رنگ ہلکا کرتا ہے، لیکن کراؤن یا امپلانٹ کا رنگ نہیں بدلتا۔ نتائج مختلف ہو سکتے ہیں اور کچھ عرصے کے لیے حساسیت یا مسوڑھوں میں جلن ہو سکتی ہے۔ مشورے کے دوران اپنی سابقہ دندانی کیفیت اور توقعات بتائیں۔',
      ar: 'ينبغي فحص صحة الأسنان واللثة قبل التوصية بالتبييض. يغيّر التبييض لون الأسنان الطبيعية، لكنه لا يفتح لون التيجان أو الزرعات. تختلف النتائج، وقد تحدث حساسية مؤقتة في الأسنان أو تهيّج في اللثة. ناقش تاريخك العلاجي وتوقعاتك مع الطبيب خلال الاستشارة.' } },
  { q: { en: 'How do braces and clear aligners improve my smile?', ur: 'بریسز اور شفاف الائنرز دانتوں کو کیسے درست کرتے ہیں؟', ar: 'كيف تساعد تقويمات الأسنان والمصففات الشفافة على تحسين ابتسامتي؟' },
    a: { en: 'Orthodontic treatment gradually moves teeth to improve their alignment and how they meet when you bite. Fixed braces and removable clear aligners are different approaches. A dental assessment helps determine which option is appropriate for your teeth and bite.',
      ur: 'آرتھوڈانٹک علاج دانتوں کو آہستہ آہستہ حرکت دے کر ان کی ترتیب اور کاٹنے کے وقت اوپری اور نچلے دانتوں کے ملاپ کو بہتر بناتا ہے۔ فکسڈ بریسز اور اتارے جانے والے شفاف الائنرز اس کے مختلف طریقے ہیں۔ معائنے سے معلوم ہوتا ہے کہ آپ کے دانتوں اور بائٹ کے لیے کون سا طریقہ مناسب ہے۔',
      ar: 'يحرك علاج التقويم الأسنان تدريجياً لتحسين انتظامها وطريقة التقاء الأسنان عند العض. التقويم الثابت والمصففات الشفافة القابلة للإزالة طريقتان مختلفتان للعلاج. يساعد الفحص على تحديد الخيار المناسب لأسنانك وإطباقك.' } },
];
