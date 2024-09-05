import city from '../seeds/city.json'

export const getCity = (level:number) =>city.filter((c)=> c.level === level)