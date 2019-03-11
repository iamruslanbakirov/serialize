import { validate, ValidatorOptions } from "class-validator";

export const modelNames = Symbol("serialize:modelNames");
export const modelNamesConfig = Symbol("serialize:modelNamesConfig");

export interface BindPropertyToApiParamsInterface {
  apiKey?: string;
  deserializable?: boolean;
}

export interface SerializableInterface {
  [key: string]: any;
}

/**
 * Связывание свойства модели с именем с АПИ
 * Если deserializable = true, то после констурктора будет установлено значение указаное
 * в apiKey или по ключу декарируемого свойства
 */
export function BindPropertyToApi<T>(
  params: BindPropertyToApiParamsInterface = {}
) {
  return function(target: any, propertyKey: string) {
    const { apiKey = propertyKey, deserializable = false } = params;

    const bindingNamesMap = target[modelNames] || new Map();

    bindingNamesMap.set(propertyKey, apiKey);

    target[modelNames] = bindingNamesMap;

    const bindingNamesConfigMap = target[modelNamesConfig] || new Map();
    bindingNamesConfigMap.set(propertyKey, deserializable);

    target[modelNamesConfig] = bindingNamesConfigMap;
  };
}

export function Deserialize<K>() {
  return function<
    R extends { new (...args: any[]): { deserialize(resp: K): void } }
  >(constructor: R) {
    return class extends constructor {
      constructor(...args: any[]) {
        super(...args);
        const [resp] = args;
        this.deserialize(resp as K);
      }
    };
  };
}

export function Validatable(validatorOptions?: ValidatorOptions) {
  return function<R extends { new (...args: any[]): {} }>(constructor: R) {
    return class extends constructor {
      constructor(...args: any[]) {
        super(...args);
        validate(this, validatorOptions).then(errors => {
          if (errors.length) {
            const modelKeysInlineString = errors.reduce(
              (acc: string, error) => {
                const errorMessages = Object.values(error.constraints).reduce(
                  (errorMessage: string, v: string) =>
                    (errorMessage += `\n${v}: but got a ${error.value}`),
                  ""
                );

                return (acc += errorMessages);
              },
              ""
            );
            throw new Error(
              `Model property incomparable: \n${modelKeysInlineString}`
            );
          }
        });
      }
    };
  };
}

export abstract class Serializable<T> implements SerializableInterface {
  constructor(resp?: T) {}

  deserialize(resp: T) {
    const bindingNamesMap = (this as SerializableInterface)[
      modelNames as any
    ] as Map<string, string>;
    const bindingNamesConfigMap = (this as SerializableInterface)[
      modelNamesConfig as any
    ] as Map<string, boolean>;

    if (!bindingNamesMap) {
      return;
    }

    Array.from(bindingNamesMap.keys()).forEach(key => {
      const apiKey = bindingNamesMap.get(key);

      if (
        apiKey &&
        resp.hasOwnProperty(apiKey) &&
        bindingNamesConfigMap.get(key)
      ) {
        (this as SerializableInterface)[key] = (this as SerializableInterface)[
          apiKey
        ];
      }
    });
  }

  private findApiKey(key: string): string | undefined {
    const apiKeys = (this as SerializableInterface)[modelNames as any] as Map<
      string,
      string
    >;
    if (apiKeys) {
      return apiKeys.get(key);
    }

    return;
  }

  serialize(): T {
    return Object.keys(this).reduce((acc: any, key) => {
      const apiKey = this.findApiKey(key);

      const value = (this as SerializableInterface)[key];

      if (apiKey) {
        acc[apiKey] = Array.isArray(value)
          ? value.map((k: Serializable<any>) =>
              k instanceof Serializable ? k.serialize() : k
            )
          : value instanceof Serializable
          ? value.serialize()
          : value;

        return acc;
      }

      acc[key] = value;

      return acc;
    }, {});
  }
}
