// 네이티브 Text/TextInput에 Pretendard를 기본으로 붙인다.
// 뒤에 오는 style이 fontFamily를 다시 지정하면 그 값이 이긴다.
// 웹은 CSS가 family를 덮어 쓰므로 이 기본값은 폴백이다.
module.exports = function ({ types: t }) {
  const names = new Set(['Text', 'TextInput'])
  const font = () =>
    t.objectExpression([
      t.objectProperty(t.identifier('fontFamily'), t.stringLiteral('Pretendard-Regular')),
    ])

  return {
    visitor: {
      JSXOpeningElement(path, state) {
        const filename = state.filename || ''
        if (filename.includes('node_modules')) return
        const name = path.node.name
        if (name.type !== 'JSXIdentifier' || !names.has(name.name)) return
        const attr = path.node.attributes.find(
          (item) => item.type === 'JSXAttribute' && item.name && item.name.name === 'style',
        )
        const fontExpr = t.jsxExpressionContainer(font())
        if (!attr) {
          path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier('style'), fontExpr))
          return
        }
        if (!attr.value || attr.value.type !== 'JSXExpressionContainer') return
        if (attr.value.expression.type === 'JSXEmptyExpression') return
        attr.value.expression = t.arrayExpression([font(), attr.value.expression])
      },
    },
  }
}
