// 预置教材库（内置示例数据，用户可在浏览器本地添加自定义教材）
// 注意：数据为示例性内容，便于演示流程；可自行扩展
window.PRESET_TEXTBOOKS = [
  {
    id: "math_grade3_pep",
    subject: "数学",
    grade: "三年级",
    version: "人教版",
    title: "义务教育教科书·数学（三年级上册）",
    chapters: [
      { id: "ch1", title: "时、分、秒", lessons: ["秒的认识", "时间的计算"] },
      { id: "ch2", title: "万以内的加法和减法（一）", lessons: ["两位数加两位数", "两位数减两位数", "几百几十加减"] },
      { id: "ch3", title: "测量", lessons: ["毫米、分米的认识", "千米的认识", "吨的认识"] }
    ]
  },
  {
    id: "chinese_grade4_pep",
    subject: "语文",
    grade: "四年级",
    version: "人教版",
    title: "义务教育教科书·语文（四年级上册）",
    chapters: [
      { id: "ch1", title: "第一单元", lessons: ["观潮", "走月亮", "现代诗二首", "繁星"] },
      { id: "ch2", title: "第二单元", lessons: ["一个豆荚里的五粒豆", "蝙蝠和雷达", "呼风唤雨的世纪"] }
    ]
  },
  {
    id: "english_grade5_pep",
    subject: "英语",
    grade: "五年级",
    version: "人教版",
    title: "义务教育教科书·英语（五年级上册）",
    chapters: [
      { id: "ch1", title: "Unit 1 What's he like?", lessons: ["Part A Let's talk", "Part A Let's learn", "Part B Read and write"] },
      { id: "ch2", title: "Unit 2 My week", lessons: ["Part A Let's talk", "Part A Let's learn", "Part B Read and write"] }
    ]
  },
  {
    id: "math_grade7_pep",
    subject: "数学",
    grade: "七年级",
    version: "人教版",
    title: "义务教育教科书·数学（七年级上册）",
    chapters: [
      { id: "ch1", title: "第一章 有理数", lessons: ["正数和负数", "有理数的加减法", "有理数的乘除法"] },
      { id: "ch2", title: "第二章 整式的加减", lessons: ["整式", "整式的加减"] }
    ]
  },
  {
    id: "physics_grade8_pep",
    subject: "物理",
    grade: "八年级",
    version: "人教版",
    title: "义务教育教科书·物理（八年级上册）",
    chapters: [
      { id: "ch1", title: "第一章 机械运动", lessons: ["长度和时间的测量", "运动的描述", "运动的快慢"] },
      { id: "ch2", title: "第二章 声现象", lessons: ["声音的产生与传播", "声音的特性", "噪声的危害和控制"] }
    ]
  },
  {
    id: "chinese_grade7_pep",
    subject: "语文",
    grade: "七年级",
    version: "人教版",
    title: "义务教育教科书·语文（七年级上册）",
    chapters: [
      { id: "ch1", title: "第一单元", lessons: ["春", "济南的冬天", "雨的四季", "古代诗歌四首"] },
      { id: "ch2", title: "第二单元", lessons: ["秋天的怀念", "散步", "散文诗二首", "《世说新语》二则"] }
    ]
  }
];

// 常见 LLM 服务预设（用户可在设置中自定义）
window.LLM_PRESETS = [
  {
    name: "智谱 GLM",
    base_url: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-flash",
    key_url: "https://open.bigmodel.cn/usermanage/apikeys",
    note: "国内访问快，有免费额度。注意：浏览器直调可能受 CORS 限制，如遇跨域错误请改用其他服务或自建代理。"
  },
  {
    name: "OpenAI",
    base_url: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    key_url: "https://platform.openai.com/api-keys",
    note: "官方支持浏览器 CORS。需海外网络访问。"
  },
  {
    name: "DeepSeek",
    base_url: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    key_url: "https://platform.deepseek.com/api_keys",
    note: "价格低廉，国内可访问。CORS 支持情况请实测。"
  },
  {
    name: "自定义",
    base_url: "",
    model: "",
    key_url: "",
    note: "填写任意 OpenAI 兼容端点。如使用 Cloudflare Worker 代理，填代理地址。"
  }
];
