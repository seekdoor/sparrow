/* eslint-disable no-param-reassign */
import parse from 'postcss-value-parser'
import camelizeStyleName from 'camelize'
import transforms from './transforms/index'
import devPropertiesWithoutUnitsRegExp from './devPropertiesWithoutUnitsRegExp'
import TokenStream from './TokenStream'
import { parse as postcssParse, Root } from "postcss";
import _ from 'lodash';

// Note if this is wrong, you'll need to change tokenTypes.js too
const numberOrLengthRe = /^([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?)(?:px)?$/i
const numberOnlyRe = /^[+-]?(?:\d*\.\d*|[1-9]\d*)(?:e[+-]?\d+)?$/i
const boolRe = /^true|false$/i
const nullRe = /^null$/i
const undefinedRe = /^undefined$/i
const lengthUnitRe = /^([+-]?(?:\d*\.?)\d+)(px|%|ch|em|ex|rem|vh|vw|vmin|vmax|cm|mm|in|pc|pt)$/i

// Undocumented export
export const transformRawValue = (propName, value) => {
  if (process.env.NODE_ENV !== 'production') {
    const needsUnit = !devPropertiesWithoutUnitsRegExp.test(propName)
    const isNumberWithoutUnit = numberOnlyRe.test(value)
    if (needsUnit && isNumberWithoutUnit) {
      // eslint-disable-next-line no-console
      console.warn(`Expected style "${propName}: ${value}" to contain units`)
    }
    if (!needsUnit && value !== '0' && !isNumberWithoutUnit) {
      // eslint-disable-next-line no-console
      console.warn(`Expected style "${propName}: ${value}" to be unitless`)
    }
  }
  const lengthUnitMatch = value.match(lengthUnitRe);
  if (lengthUnitMatch && lengthUnitMatch.length === 3) {
    return {
      value: lengthUnitMatch[1],
      unit: lengthUnitMatch[2]
    };
  }

  const numberMatch = value.match(numberOrLengthRe)
  if (numberMatch !== null) return Number(numberMatch[1])

  const boolMatch = value.match(boolRe)
  if (boolMatch !== null) return boolMatch[0].toLowerCase() === 'true'

  const nullMatch = value.match(nullRe)
  if (nullMatch !== null) return null

  const undefinedMatch = value.match(undefinedRe)
  if (undefinedMatch !== null) return undefined
  return value
}

const baseTransformShorthandValue = (propName, value) => {
  const ast = parse(value)
  const tokenStream = new TokenStream(ast.nodes)
  return transforms[propName](tokenStream, propName)
}

const transformShorthandValue =
  process.env.NODE_ENV === 'production'
    ? baseTransformShorthandValue
    : (propName, value) => {
        try {
          return baseTransformShorthandValue(propName, value)
        } catch (e) {
          throw new Error(`Failed to parse declaration "${propName}: ${value}"`)
        }
      }

export const getStylesForProperty = (propName, inputValue, allowShorthand) => {
  const isRawValue = allowShorthand === false || !(propName in transforms)
  const value = inputValue.trim()
  const propValues = isRawValue
    ? { [propName]: transformRawValue(propName, value) }
    : transformShorthandValue(propName, value)

  return propValues
}

export const getPropertyName = propName => {
  const isCustomProp = /^--\w+/.test(propName)
  if (isCustomProp) {
    return propName
  }
  return camelizeStyleName(propName)
}

export default function transform(css: string, shorthandBlacklist = []) {
  try {
    // css = ':root { box-shadow: 10px 10px 5px 10px #888888;}'
    const root: Root = postcssParse(css);
    const nodes = _.get(root, 'nodes[0].nodes');
    const rules = nodes.reduce((rules, current) => {
      const rule = [current.prop, current.value];
      rules.push(rule);
      return rules;
    },[])

    const res = rules.reduce((accum, rule) => {
      const propertyName = getPropertyName(rule[0])
      const value = rule[1]
      const allowShorthand = shorthandBlacklist.indexOf(propertyName) === -1
      try {
        return Object.assign(
          accum,
          getStylesForProperty(propertyName, value, allowShorthand)
        )
      } catch (e) {
        return accum;
      }
   
    }, {});
    return res;
  } catch (e) {
    console.error(`${e.reason} on line ${e.line}`);
  }
}
