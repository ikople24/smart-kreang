const communities = [
  "หมู่1-บ้านควนป้อม",
  "หมู่2-บ้านไทรหัวม้า",
  "หมู่3-บ้านควนยาว",
  "หมู่4-บ้านควนเคร็ง",
  "หมู่5-บ้านทุ่งใคร",
  "หมู่6-บ้านโคกเลา",
  "หมู่7-บ้านย่านแดง",
  "หมู่8-บ้านเสม็ดงาม",
  "หมู่9-บ้านควนชิง",
  "หมู่10-บ้านดอนแต้ว",
  "หมู่11-บ้านไสขนุน",
];

const CommunitySelector = ({ selected, onSelect = () => {}, error }) => (
  <div className="mb-4">
    <div className="flex py-2 gap-2">
      <label className="block text-sm font-medium text-gray-800 mb-1">
        1.เลือกชุมชน
      </label>
      {error && <div className="text-red-500 text-sm ml-auto">{error}</div>}
    </div>
    <div className="flex flex-wrap gap-2">
      {communities.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onSelect(c)}
          className={`btn btn-sm rounded-full px-4 py-2 text-base font-medium ${
            selected === c
              ? "bg-blue-600 text-white border-none"
              : "bg-blue-100 text-blue-500 hover:bg-blue-300 border-none"
          } transition duration-200 min-w-[120px] max-w-full sm:w-auto`}
        >
          {c}
        </button>
      ))}
    </div>
  </div>
);
export default CommunitySelector;
