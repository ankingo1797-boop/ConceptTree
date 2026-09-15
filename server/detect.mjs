// 候选概念检测（规则版）— 从 server.js 抽出，便于单元测试
// 职责：从 AI 回答文本中提取候选概念词（英文 PascalCase/缩写 + 中文词表/后缀模式）

const STOP_WORDS_EN = new Set(['the','a','an','this','that','these','those','and','or','but','for','with','from','into','onto','upon','about','after','before','between','through','during','within','without','under','over','across','along','around','behind','below','beneath','beside','beyond','near','off','out','up','down','via','is','are','was','were','be','been','being','has','have','had','do','does','did','will','would','can','could','should','may','might','must','shall','not','no','yes','so','such','than','then','there','here','when','where','why','how','what','which','who','whom','whose','if','else','also','too','very','just','only','more','most','some','any','all','each','every','both','neither','either','few','several','many','much','other','another'])

const KNOWN_TERMS = ['机器学习','深度学习','强化学习','监督学习','无监督学习','半监督学习','自监督学习','迁移学习','联邦学习','元学习','知识蒸馏','注意力机制','自注意力','多头注意力','神经网络','卷积神经网络','循环神经网络','生成对抗网络','图神经网络','大语言模型','语言模型','预训练','微调','提示工程','上下文学习','思维链','智能体','多智能体','向量数据库','知识图谱','推荐系统','计算机视觉','自然语言处理','概率分布','贝叶斯','线性回归','逻辑回归','决策树','随机森林','梯度下降','反向传播','过拟合','欠拟合','正则化','损失函数','激活函数','嵌入']

// 虚词/标点：后缀模式的尾部延伸不得吞入这些字符；含这些字符的中文候选整体拒绝（H1 修复）
// 用反引号常量 + 程序化构造正则，避免引号字符在字符串字面量里造成语法歧义
const FUNC_SET = `，。；：！？、""''（）()的了和与在及或从到对向于是有被把让给等也都很更最并且而但却得着吗呢吧啊呀`
const FUNC_CHARS = new RegExp('[\\s' + FUNC_SET + ']')
// 后缀尾部允许的延伸字符 = 空白与虚词/标点之外
const TRAILING_CHARS = '[^\\s' + FUNC_SET + ']'

export function detectCandidates(text, existingNames) {
  if (!text || typeof text !== 'string') return []
  const existing = new Set(existingNames || [])
  const candidates = new Set()

  // 英文：PascalCase / camelCase / 全大写缩写
  const enRe = /\b([A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*){0,2})\b/g
  let m
  while ((m = enRe.exec(text)) !== null) {
    const word = m[1]
    if (STOP_WORDS_EN.has(word.toLowerCase())) continue
    if (/^(The|A|An|This|That|These|Those|In|On|At|By|For|With|From|To)$/i.test(word)) continue
    const hasUpper = /[A-Z]/.test(word)
    const allUpper = /^[A-Z]{2,6}$/.test(word)
    if ((hasUpper && word.length >= 3) || allUpper) candidates.add(word.trim())
  }

  // 中文：词表 + 后缀模式
  for (const term of KNOWN_TERMS) if (text.includes(term)) candidates.add(term)
  const zhPatterns = [
    /[\u4e00-\u9fa5]{2,6}(?:算法|模型|架构|机制|理论|原理|方法|框架|范式|体系|系统|网络|结构|协议|技术|效应|定律|定理|假说|假设|函数|方程|矩阵|向量|概率|分布|回归|分类|聚类|优化|损失|梯度|范式)/g,
    // H1：尾部延伸不得吞入虚词/标点（原 [\u4e00-\u9fa5]{0,4} 会把「架构和深度学」整个吞掉）
    new RegExp('(?:算法|模型|架构|机制|理论|原理|方法|框架|体系|系统|协议|技术|效应|定律|定理|假说|假设|函数|方程|分布|回归|分类|聚类|优化|梯度|蒸馏|范式)' + TRAILING_CHARS + '{0,4}', 'g'),
  ]
  for (const re of zhPatterns) {
    let zm
    while ((zm = re.exec(text)) !== null) {
      const term = zm[0].trim()
      // H1：含虚词/标点的候选整体拒绝（原尾部守卫只拦「虚词+4字以上」，拦不住「架构和深度学」）
      if (term.length >= 2 && term.length <= 12 && !FUNC_CHARS.test(term)) candidates.add(term)
    }
  }

  return [...candidates].filter((c) => !existing.has(c)).slice(0, 20)
}
