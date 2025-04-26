import gql from 'graphql-tag';

export default gql`
  query GetLanguageCodes {
    __type(name: "LanguageCode") {
      enumValues {
        name
      }
    }
  }
`;
