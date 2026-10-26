const ERRORS: Record<string, string> = {
  NO_STOCK: 'স্টকে তত পিস নেই; পরিমাণ কমিয়ে দিন।',
  CHALAN_CLOSED: 'চালানটি বন্ধ হয়ে গেছে; সম্পাদনা করা যাবে না।',
  CHALAN_NOT_OPEN: 'চালানটি খোলা নেই।',
  STOCK_LEFT: 'স্টকে পিস বাকি আছে; আগে নষ্ট/ফ্রি হিসেবে সমন্বয় করুন।',
  PACKET_NOT_FOUND: 'প্যাকেট পাওয়া যায়নি।',
  TRANSFER_CASH_SOURCE_FREE: 'ক্যাশ থেকে এমএফএসে স্থানান্তরে চার্জ হয় না।',
  WITHDRAWAL_INVALID: 'উত্তোলনের তথ্য মিলছে না।',
  TRANSFER_INVALID: 'স্থানান্তরের তথ্য মিলছে না।',
  EXPENSE_INVALID: 'খরচের তথ্য মিলছে না।',
  SALE_INVALID: 'বিক্রির তথ্য মিলছে না; আবার দেখুন।',
  SALE_WALLET_INVALID: 'কোথায় টাকা মিলছেনি; ওয়ালেট বাছুন।',
  PERSONAL_INVALID: 'ব্যক্তিগত ব্যবহারের তথ্য মিলছে না।',
  ADJUSTMENT_INVALID: 'সমন্বয়ের তথ্য মিলছে না।',
  PACK_INVALID: 'প্যাকেটের আকার বৈধ নয়।',
  CHALAN_ITEM_INVALID: 'কেনার তথ্য বৈধ নয়।',
  CHALAN_NO_ITEMS: 'অন্তত একজন পার্টনারের কেনা দিন।',
  PACK_NO_ITEMS: 'প্যাকিংয়ের তথ্য দিন।',
  PACK_ITEM_INVALID: 'প্যাকিংয়ের মালিক ও পিস দিন।',
  PRIORITY_UNKNOWN_PACKET: 'প্রায়োরিটি তালিকার প্যাকেট বদলে গেছে; আবার চেষ্টা করুন।',
  PRIORITY_DUPLICATE: 'প্রায়োরিটি তালিকায় একই প্যাকেট দুবার আছে।',
  NOT_ACTIVE: 'আপনার অ্যাকাউন্ট নিষ্ক্রিয়।',
  CHANGE_PASSWORD_REQUIRED: 'প্রথমে পাসওয়ার্ড পরিবর্তন করুন।',
  BALANCE_CHECK_REQUIRED: 'সোর্স ও গন্তব্য ওয়ালেট আলাদা করুন।',
};

export function mapError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const code = Object.keys(ERRORS).find((k) => msg.includes(k));
  return code ? ERRORS[code]! : 'সমস্যা হয়েছে; আবার চেষ্টা করুন।';
}
