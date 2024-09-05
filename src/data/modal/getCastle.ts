import castle from '../seeds/castle.json'

export const getCastle = (level:number) => castle.filter((c)=> c.level === level)