import db  from "./db-config";

const getOtherBuilds = (arr, build) => {
  let other_builds = "";
  let index = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].build) other_builds += `${arr[i].build}, `;
    if (arr[i].build === build) index = i;
  }
  return [{ ...arr[index], other_builds }];
};
const getCommander = async (name, build) => {
  const response = await db("commander").where({ name });
  if (response.length === 0) return [];
  if (response.length === 1) return response;
  return getOtherBuilds(response, build);
};

const getCity = (level) => {
  return db("city").where({ level });
};
const getCastle = (level) => {
  return db("castle").where({ level });
};
module.exports = {
  getCommander,
  getCity,
  getCastle,
};
